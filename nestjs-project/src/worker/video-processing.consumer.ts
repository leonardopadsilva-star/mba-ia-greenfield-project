import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { VideoProcessingService } from './video-processing.service';

interface VideoProcessingPayload {
  videoId: string;
  originalKey: string;
}

@Controller()
export class VideoProcessingConsumer {
  constructor(
    private readonly videoProcessingService: VideoProcessingService,
  ) {}

  @EventPattern('video.processing')
  async handleProcessing(
    @Payload() data: VideoProcessingPayload,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    try {
      await this.videoProcessingService.process(
        data.videoId,
        data.originalKey,
      );
    } finally {
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage();
      channel.ack(originalMsg);
    }
  }
}
