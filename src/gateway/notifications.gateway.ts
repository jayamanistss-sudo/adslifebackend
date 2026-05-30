import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: {
    origin: ['https://adslife.in', 'https://www.adslife.in', 'http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  // userId → Set of socket ids
  private userSockets = new Map<number, Set<string>>();

  constructor(
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers?.authorization as string)?.replace('Bearer ', '');

      if (!token) { client.disconnect(); return; }

      const payload = this.jwt.verify(token, {
        secret: this.config.get<string>('jwt.secret'),
      }) as { user_id: number };

      const userId = payload.user_id;
      client.data.userId = userId;

      if (!this.userSockets.has(userId)) this.userSockets.set(userId, new Set());
      this.userSockets.get(userId)!.add(client.id);

      client.join(`user:${userId}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId)!.delete(client.id);
      if (this.userSockets.get(userId)!.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  /** Emit a notification to specific user IDs */
  sendToUsers(userIds: number[], event: string, payload: Record<string, any>) {
    for (const uid of userIds) {
      this.server.to(`user:${uid}`).emit(event, payload);
    }
  }

  /** Check if a user is currently connected */
  isOnline(userId: number): boolean {
    return (this.userSockets.get(userId)?.size ?? 0) > 0;
  }
}
