import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { ChannelsService } from '../channels/channels.service';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { InitiateUploadResult, VideosService } from './videos.service';

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(
    private readonly videosService: VideosService,
    private readonly channelsService: ChannelsService,
  ) {}

  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Initiate a video upload',
    description:
      'Pre-registers a video as a draft and returns presigned multipart upload URLs for the client to upload directly to storage.',
  })
  @ApiResponse({
    status: 201,
    description: 'Upload initiated',
    schema: {
      properties: {
        id: { type: 'string' },
        upload_id: { type: 'string' },
        parts: {
          type: 'array',
          items: {
            properties: {
              part_number: { type: 'number' },
              url: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'File exceeds the 10GB limit, or validation failed',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async initiateUpload(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InitiateUploadDto,
  ): Promise<InitiateUploadResult> {
    const channel = await this.channelsService.findByUserId(user.sub);
    return this.videosService.initiateUpload(channel.id, dto);
  }
}
