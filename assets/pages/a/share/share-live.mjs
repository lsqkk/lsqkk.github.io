import { normalizedCode } from './share-model.mjs';

const iceServers = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }
];

function signalingDescription(pc) {
    return { type: pc.localDescription.type, sdp: pc.localDescription.sdp };
}

export async function describeConnection(pc) {
    try {
        const stats = await pc.getStats();
        const transport = [...stats.values()].find((stat) => stat.type === 'transport' && stat.selectedCandidatePairId);
        const pair = stats.get(transport?.selectedCandidatePairId)
            || [...stats.values()].find((stat) => stat.type === 'candidate-pair' && stat.state === 'succeeded' && stat.nominated);
        if (!pair) return '加密通道已就绪';
        const local = stats.get(pair.localCandidateId);
        const remote = stats.get(pair.remoteCandidateId);
        const type = [local?.candidateType, remote?.candidateType].includes('relay')
            ? '加密中继'
            : [local?.candidateType, remote?.candidateType].every((value) => value === 'host') ? '本地网络直连' : '公网直连';
        const latency = pair.currentRoundTripTime;
        return Number.isFinite(latency) ? `${type} · RTT ${Math.round(latency * 1000)} ms` : type;
    } catch {
        return '加密通道已就绪';
    }
}

export class LiveRoom {
    constructor(api, events, config = {}) {
        this.api = api;
        this.events = events;
        this.abort = new AbortController();
        this.timer = null;
        this.disconnectTimer = null;
        this.channel = null;
        this.invite = null;
        this.failedPolls = 0;
        this.connected = false;
        this.legacy = false;
        this.config = config;
        this.candidates = [];
        this.sent = 0;
        this.received = 0;
        this.answerReady = false;
    }

    async setup() {
        const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(4500)]);
        const relay = await this.api('ice-config', {}, { signal, auth: true }).catch(() => ({}));
        if (this.abort.signal.aborted) return false;
        const extra = Array.isArray(relay.iceServers) ? relay.iceServers : [];
        this.pc = new RTCPeerConnection({ iceServers: [...iceServers, ...extra], ...this.config });
        this.pc.onicecandidate = ({ candidate }) => {
            if (candidate && this.candidates.length < 48) this.candidates.push(candidate.toJSON());
        };
        this.pc.ondatachannel = (event) => {
            if (!this.channel && event.channel.label === 'fileTransfer') this.attach(event.channel);
            else event.channel.close();
        };
        this.pc.onconnectionstatechange = () => {
            if (this.abort.signal.aborted) return;
            if (this.pc.connectionState === 'failed' && this.connected) this.fail('设备连接已中断，请重新连接。');
            if (this.pc.connectionState === 'disconnected' && this.connected) {
                this.events.reconnecting();
                clearTimeout(this.disconnectTimer);
                this.disconnectTimer = setTimeout(() => this.fail('网络中断，请重新连接设备。'), 12_000);
            }
            if (this.pc.connectionState === 'connected') {
                clearTimeout(this.disconnectTimer);
                if (this.connected) this.events.reconnected(this.pc);
            }
        };
        return true;
    }

    attach(channel) {
        this.channel = channel;
        channel.binaryType = 'arraybuffer';
        channel.onopen = () => {
            if (this.abort.signal.aborted) return;
            clearTimeout(this.timer);
            this.connected = true;
            this.events.connected(channel, this.pc, this.legacy);
        };
        channel.onmessage = (event) => this.events.message(event.data);
        channel.onclose = () => this.fail('对方离开了连接。已接收的文件仍可以下载。');
        channel.onerror = () => this.fail('传输通道中断。请重新连接后重试。');
    }

    request(action, body) {
        return this.api(action, body, { signal: this.abort.signal });
    }

    async host(intent) {
        if (!await this.setup()) return;
        this.attach(this.pc.createDataChannel('fileTransfer', { ordered: true }));
        await this.pc.setLocalDescription(await this.pc.createOffer());
        if (this.abort.signal.aborted) return;
        const invite = await this.api('room-create', { intent, offer: signalingDescription(this.pc) }, { auth: true });
        this.invite = invite;
        if (this.abort.signal.aborted) {
            this.closeSignal();
            return;
        }
        this.events.invite(invite);
        void this.poll();
    }

    async join(raw) {
        const code = normalizedCode(raw);
        this.legacy = code.length === 3;
        const action = this.legacy ? 'legacy-read' : 'room-join';
        const setup = this.setup();
        const response = await this.request(action, { code });
        if (!this.legacy) this.invite = { code, token: response.token, expiresAt: response.expiresAt };
        if (!await setup || this.abort.signal.aborted) {
            this.closeSignal();
            return;
        }
        this.events.role(response.intent === 'collect' ? 'send' : 'receive', this.legacy);
        await this.pc.setRemoteDescription(response.offer);
        if (this.legacy) {
            for (const candidate of response.candidates || []) {
                await this.pc.addIceCandidate(candidate).catch(() => {});
            }
        }
        await this.pc.setLocalDescription(await this.pc.createAnswer());
        if (this.abort.signal.aborted) return;
        if (this.legacy) {
            // Older hosts consume an answer SDP once and do not poll for candidates.
            const deadline = Date.now() + 7500;
            while (!this.abort.signal.aborted && this.pc.iceGatheringState !== 'complete' && Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 150));
            }
            if (this.abort.signal.aborted) return;
            await this.request('legacy-answer', { code, claim: response.claim, expiresAt: response.expiresAt, answer: signalingDescription(this.pc) });
        } else {
            await this.request('room-answer', { code, token: response.token, answer: signalingDescription(this.pc) });
            this.answerReady = true;
            void this.poll();
        }
        this.startDeadline();
    }

    startDeadline() {
        this.connectUntil ??= Date.now() + 40_000;
        if (!this.legacy || this.connected || this.abort.signal.aborted) return;
        this.timer = setTimeout(() => this.fail('设备连接超时。请尝试同一 Wi-Fi，或使用离线包。'), 40_000);
    }

    async poll() {
        if (this.abort.signal.aborted || this.connected) return;
        if (Date.now() >= this.connectUntil) {
            this.fail('设备连接超时。请尝试同一 Wi-Fi，或使用离线包。');
            return;
        }
        if (Date.now() >= this.invite.expiresAt) {
            this.fail('这次连接邀请已过期，请重新生成连接码。');
            return;
        }
        const { code, token } = this.invite;
        try {
            const candidates = this.candidates.slice(this.sent);
            const { answer, candidates: remote = [] } = await this.request('room-poll', { code, token, candidates });
            if (this.abort.signal.aborted) return;
            this.sent += candidates.length;
            this.failedPolls = 0;
            if (answer && !this.answerReady) {
                await this.pc.setRemoteDescription(answer);
                this.answerReady = true;
                this.startDeadline();
            }
            if (this.answerReady) {
                for (const candidate of remote.slice(this.received)) {
                    await this.pc.addIceCandidate(candidate).catch(() => {});
                    this.received++;
                }
            }
        } catch (error) {
            if (this.abort.signal.aborted) return;
            this.failedPolls += 1;
            if (this.failedPolls >= 5 || [403, 404].includes(error.status)) {
                this.fail(error.message);
                return;
            }
        }
        if (!this.connected && !this.abort.signal.aborted) {
            this.timer = setTimeout(() => void this.poll(), this.failedPolls ? 3000 : this.answerReady ? 800 : 2200);
        }
    }

    fail(message) {
        if (this.abort.signal.aborted) return;
        this.events.failed(message);
        this.close();
    }

    closeSignal() {
        if (this.invite) {
            const { code, token } = this.invite;
            void this.api('room-close', { code, token }, { keepalive: true }).catch(() => {});
        }
    }

    close() {
        if (this.abort.signal.aborted) return;
        this.abort.abort();
        clearTimeout(this.timer);
        clearTimeout(this.disconnectTimer);
        this.pc?.close();
        this.closeSignal();
    }
}
