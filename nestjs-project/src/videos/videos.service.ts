import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { nanoid } from 'nanoid';
import { Repository } from 'typeorm';
import { StorageService, UploadPartUrl } from '../storage/storage.service';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { Video } from './entities/video.entity';
import { FileTooLargeException } from './exceptions/video.exceptions';

const TEN_GB_BYTES = 10 * 1024 * 1024 * 1024;
const PART_SIZE_BYTES = 10 * 1024 * 1024;
const PUBLIC_ID_LENGTH = 12;

export interface InitiateUploadResult {
  id: string;
  upload_id: string;
  parts: UploadPartUrl[];
}

function extractExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot === -1 ? '' : filename.slice(lastDot);
}

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly storageService: StorageService,
  ) {}

  async initiateUpload(
    channelId: string,
    dto: InitiateUploadDto,
  ): Promise<InitiateUploadResult> {
    if (dto.size_bytes > TEN_GB_BYTES) {
      throw new FileTooLargeException();
    }

    const videoId = randomUUID();
    const key = `videos/${channelId}/${videoId}/original${extractExtension(dto.original_filename)}`;
    const partCount = Math.ceil(dto.size_bytes / PART_SIZE_BYTES);

    const { uploadId } = await this.storageService.createMultipartUpload(
      key,
      dto.content_type,
    );

    const publicId = nanoid(PUBLIC_ID_LENGTH);
    await this.videoRepository.save(
      this.videoRepository.create({
        id: videoId,
        public_id: publicId,
        channel_id: channelId,
        original_filename: dto.original_filename,
        original_key: key,
        upload_id: uploadId,
      }),
    );

    const parts = await this.storageService.getUploadPartUrls(
      key,
      uploadId,
      partCount,
    );

    return { id: publicId, upload_id: uploadId, parts };
  }
}
