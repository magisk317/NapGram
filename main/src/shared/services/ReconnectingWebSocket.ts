import { EventEmitter } from 'events';
import { getLogger } from '../utils/logger';

const logger = getLogger('ReconnectingWS');

export interface ReconnectOptions {
    minDelay?: number;
    maxDelay?: number;
    factor?: number;
    maxRetries?: number;
}

export class ReconnectingWebSocket extends EventEmitter {
    private ws: WebSocket | null = null;
    private retryCount = 0;
    private isIntentionalClose = false;
    private reconnectTimer: NodeJS.Timeout | null = null;

    private options: Required<ReconnectOptions>;

    constructor(private url: string, options: ReconnectOptions = {}) {
        super();
        this.options = {
            minDelay: 1000,
            maxDelay: 30000,
            factor: 1.3,
            maxRetries: Infinity,
            ...options
        };
        this.connect();
    }

    private connect() {
        if (this.ws) {
            this.cleanup();
        }

        try {
            // Node 22 global WebSocket
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                logger.info(`Connected to ${this.url}`);
                this.retryCount = 0;
                this.emit('open');
            };

            this.ws.onmessage = (event) => {
                this.emit('message', event);
            };

            this.ws.onclose = (event) => {
                this.emit('close', event.code, event.reason);
                if (!this.isIntentionalClose) {
                    this.scheduleReconnect();
                }
            };

            this.ws.onerror = (event) => {
                logger.error(event, 'WebSocket error:');
                this.emit('error', event);
            };
        } catch (error) {
            logger.error(error, 'Failed to create WebSocket:');
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect() {
        if (this.retryCount >= this.options.maxRetries) {
            logger.error(new Error('Max reconnect retries reached'), 'Max reconnect retries reached. Giving up.');
            return;
        }

        const delay = Math.min(
            this.options.minDelay * Math.pow(this.options.factor, this.retryCount),
            this.options.maxDelay
        );

        logger.warn(`Connection lost. Reconnecting in ${delay}ms... (Attempt ${this.retryCount + 1})`);
        this.retryCount++;

        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }

    private cleanup() {
        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.close();
            this.ws = null;
        }
    }

    send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(data);
        } else {
            throw new Error('WebSocket is not open');
        }
    }

    close() {
        this.isIntentionalClose = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.cleanup();
    }

    get readyState() {
        return this.ws?.readyState ?? WebSocket.CLOSED;
    }
}
