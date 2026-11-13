const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CAPACITY = 6;
const iceServers = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
const slotKinds = { mic: "audio", camera: "video", share: "video" };

export function formatCode(code) {
    return code.match(/.{1,4}/g)?.join("-") ?? "";
}

export function parseCode(input) {
    let value = input.trim();
    if (/^https?:\/\//i.test(value)) {
        try { value = new URL(value).hash.slice(1); }
        catch { return ""; }
    }
    const code = value.replace(/[\s-]/g, "").toUpperCase();
    return code.length === 16 && [...code].every((char) => alphabet.includes(char)) ? code : "";
}

export function makeCode() {
    return [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => alphabet[byte & 31]).join("");
}

function encode(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function decode(value) {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

// The meeting code is never published to the signalling database. Its digest supplies
// independent material for the room address and for authenticating signalling packets.
export async function meetingSecret(code) {
    const bytes = new TextEncoder().encode(`quark-meeting-v2:${code}`);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-512", bytes));
    const address = Array.from(digest.slice(32, 52), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const key = await crypto.subtle.importKey("raw", digest.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]);
    const context = (scope) => new TextEncoder().encode(scope);
    return {
        address: `rooms/qm-${address}`,
        async seal(value, scope) {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const data = new TextEncoder().encode(JSON.stringify(value));
            const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: context(scope) }, key, data);
            return { iv: encode(iv), cipher: encode(cipher) };
        },
        async open(packet, scope) {
            if (typeof packet?.iv !== "string" || typeof packet.cipher !== "string" || packet.cipher.length > 100000) {
                throw new Error("会议数据格式无效");
            }
            const bytes = await crypto.subtle.decrypt({
                name: "AES-GCM", iv: decode(packet.iv), additionalData: context(scope)
            }, key, decode(packet.cipher));
            return JSON.parse(new TextDecoder().decode(bytes));
        }
    };
}

export class MeetingPeer {
    constructor({ initiator, trackFor, send, onState, onTrack, onMessage }) {
        this.initiator = initiator;
        this.trackFor = trackFor;
        this.send = send;
        this.onState = onState;
        this.onMessage = onMessage;
        this.pc = new RTCPeerConnection({ iceServers });
        this.transceivers = {};
        this.candidates = [];
        this.queue = Promise.resolve();
        this.outbox = Promise.resolve();
        this.retries = 0;
        this.closed = false;

        this.pc.onicecandidate = ({ candidate }) => {
            if (candidate) this.signal({ candidate: candidate.toJSON() });
        };
        this.pc.ontrack = ({ track, transceiver }) => {
            const index = this.pc.getTransceivers().indexOf(transceiver);
            onTrack(Object.keys(slotKinds)[index], track);
        };
        this.pc.onconnectionstatechange = () => {
            const state = this.pc.connectionState;
            if (state === "connected") this.retries = 0;
            this.onState(state);
            if (state === "failed" && this.initiator && this.retries < 2) {
                this.retries += 1;
                this.pc.restartIce();
            }
        };
        this.pc.ondatachannel = ({ channel }) => this.setChannel(channel);

        // Fixed media slots let either side change devices without re-offering.
        if (initiator) {
            for (const [slot, kind] of Object.entries(slotKinds)) {
                this.transceivers[slot] = this.pc.addTransceiver(kind, { direction: "sendrecv" });
            }
            this.setChannel(this.pc.createDataChannel("meeting"));
            this.pc.onnegotiationneeded = () => this.enqueue(() => this.offer());
        }
    }

    enqueue(task) {
        this.queue = this.queue.then(() => {
            if (!this.closed) return task();
        }).catch((error) => {
            if (!this.closed) this.onState("error", error);
        });
        return this.queue;
    }

    signal(value) {
        this.outbox = this.outbox.then(() => {
            if (!this.closed) return this.send(value);
        }).catch((error) => {
            if (!this.closed) this.onState("signaling", error);
        });
        return this.outbox;
    }

    async syncTracks() {
        await Promise.all(Object.entries(this.transceivers).map(async ([slot, transceiver]) => {
            const track = this.trackFor(slot);
            if (transceiver.sender.track !== track) await transceiver.sender.replaceTrack(track);
        }));
    }

    updateTracks() {
        return this.enqueue(() => this.syncTracks());
    }

    async offer() {
        if (this.pc.signalingState !== "stable") return;
        await this.syncTracks();
        await this.pc.setLocalDescription();
        this.signal({ description: this.pc.localDescription.toJSON() });
    }

    async addCandidate(candidate) {
        try { await this.pc.addIceCandidate(candidate); }
        catch (error) {
            if (error.name !== "OperationError") throw error;
        }
    }

    receive(value) {
        return this.enqueue(async () => {
            if (value?.candidate) {
                if (this.pc.remoteDescription && this.pc.signalingState === "stable") await this.addCandidate(value.candidate);
                else this.candidates.push(value.candidate);
                return;
            }

            const description = value?.description;
            if (description?.type !== (this.initiator ? "answer" : "offer")) return;
            if (this.initiator && this.pc.signalingState !== "have-local-offer") return;
            await this.pc.setRemoteDescription(description);
            for (const candidate of this.candidates.splice(0)) await this.addCandidate(candidate);

            if (!this.initiator) {
                const transceivers = this.pc.getTransceivers();
                Object.keys(slotKinds).forEach((slot, index) => {
                    const transceiver = transceivers[index];
                    transceiver.direction = "sendrecv";
                    this.transceivers[slot] = transceiver;
                });
                await this.syncTracks();
                await this.pc.setLocalDescription();
                this.signal({ description: this.pc.localDescription.toJSON() });
            }
        });
    }

    setChannel(channel) {
        this.channel = channel;
        channel.onopen = () => this.onState(this.pc.connectionState);
        channel.onclose = () => {
            if (!this.closed) this.onState(this.pc.connectionState);
        };
        channel.onmessage = ({ data }) => {
            if (typeof data !== "string" || data.length > 4096) return;
            let value;
            try { value = JSON.parse(data); }
            catch { return; }
            this.onMessage(value);
        };
    }

    sendMessage(message) {
        if (this.channel?.readyState !== "open") return false;
        try {
            this.channel.send(JSON.stringify(message));
            return true;
        } catch {
            return false;
        }
    }

    close() {
        this.closed = true;
        this.channel?.close();
        this.pc.close();
    }
}
