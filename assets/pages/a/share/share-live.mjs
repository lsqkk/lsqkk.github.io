import { normalizedCode } from './share-model.mjs';

const iceServers = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
];

function waitIce(pc, signal, wait = 2600) {
    if (signal.aborted || pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
        const finish = () => {
            clearTimeout(timer);
            pc.removeEventListener('icegatheringstatechange', changed);
            signal.removeEventListener('abort', finish);
            resolve();
        };
        const changed = () => { if (pc.iceGatheringState === 'complete') finish(); };
        const timer = setTimeout(finish, wait);
        pc.addEventListener('icegatheringstatechange', changed);
        signal.addEventListener('abort', finish, { once: true });
    });
}

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
        this.pc = new RTCPeerConnection({ iceServers, ...config });
        this.timer = null;
        this.disconnectTimer = null;
        this.channel = null;
        this.invite = null;
        this.failedPolls = 0;
        this.connected = false;
        this.legacy = false;
        this.pc.ondatachannel = (event) => {
            if (!this.channel && event.channel.label === 'fileTransfer') this.attach(event.channel);
            else event.channel.close();
        };
        this.pc.onconnectionstatechange = () => {
            if (this.abort.signal.aborted) return;
            if (this.pc.connectionState === 'failed') this.fail('这两台设备无法建立直连，请尝试同一 Wi-Fi，或改用离线包。');
            if (this.pc.connectionState === 'disconnected') {
                this.events.reconnecting();
                clearTimeout(this.disconnectTimer);
                this.disconnectTimer = setTimeout(() => this.fail('网络中断，请重新连接设备。'), 12_000);
            }
            if (this.pc.connectionState === 'connected') {
                clearTimeout(this.disconnectTimer);
                if (this.connected) this.events.reconnected(this.pc);
            }
        };
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
        this.attach(this.pc.createDataChannel('fileTransfer', { ordered: true }));
        await this.pc.setLocalDescription(await this.pc.createOffer());
        await waitIce(this.pc, this.abort.signal);
        if (this.abort.signal.aborted) return;
        const invite = await this.api('room-create', { intent, offer: signalingDescription(this.pc) }, { auth: true });
        this.invite = invite;
        if (this.abort.signal.aborted) {
            this.closeSignal();
            return;
        }
        this.events.invite(invite);
        this.poll();
    }

    async join(raw) {
        const code = normalizedCode(raw);
        this.legacy = code.length === 3;
        const action = this.legacy ? 'legacy-read' : 'room-join';
        const response = await this.request(action, { code });
        if (this.abort.signal.aborted) return;
        if (!this.legacy) this.invite = { code, token: response.token, expiresAt: response.expiresAt };
        this.events.role(response.intent === 'collect' ? 'send' : 'receive', this.legacy);
        await this.pc.setRemoteDescription(response.offer);
        if (this.legacy) {
            for (const candidate of response.candidates || []) {
                await this.pc.addIceCandidate(candidate).catch(() => {});
            }
        }
        await this.pc.setLocalDescription(await this.pc.createAnswer());
        await waitIce(this.pc, this.abort.signal);
        if (this.abort.signal.aborted) return;
        const answer = signalingDescription(this.pc);
        if (this.legacy) await this.request('legacy-answer', { code, claim: response.claim, expiresAt: response.expiresAt, answer });
        else await this.request('room-answer', { code, token: response.token, answer });
        if (!this.connected && !this.abort.signal.aborted) {
            this.timer = setTimeout(() => this.fail('设备连接超时。请确认对方仍在线，或改用离线包。'), 30_000);
        }
    }

    poll() {
        if (this.abort.signal.aborted) return;
        if (Date.now() >= this.invite.expiresAt) {
            this.fail('这次连接邀请已过期，请重新生成连接码。');
            return;
        }
        const { code, token } = this.invite;
        this.request('room-poll', { code, token }).then(async ({ answer }) => {
            if (this.abort.signal.aborted) return;
            this.failedPolls = 0;
            if (!answer) {
                this.timer = setTimeout(() => this.poll(), 2500);
                return;
            }
            await this.pc.setRemoteDescription(answer);
            if (!this.connected && !this.abort.signal.aborted) {
                this.timer = setTimeout(() => this.fail('设备连接超时。请检查对方是否在线，或改用离线包。'), 30_000);
            }
        }).catch((error) => {
            if (this.abort.signal.aborted) return;
            this.failedPolls += 1;
            if (this.failedPolls >= 3 || [403, 404].includes(error.status)) this.fail(error.message);
            else this.timer = setTimeout(() => this.poll(), 3500);
        });
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
        this.pc.close();
        this.closeSignal();
    }
}
