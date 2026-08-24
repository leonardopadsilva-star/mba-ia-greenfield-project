import { FileTooLargeException } from './exceptions/video.exceptions';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { VideosService } from './videos.service';

function makeDto(overrides: Partial<InitiateUploadDto> = {}): InitiateUploadDto {
  return {
    original_filename: 'video.mp4',
    content_type: 'video/mp4',
    size_bytes: 25 * 1024 * 1024, // 25MB
    ...overrides,
  };
}

describe('VideosService', () => {
  describe('initiateUpload', () => {
    it('throws FileTooLargeException when size_bytes exceeds 10GB, without touching storage or the repository', async () => {
      const createMultipartUpload = jest.fn();
      const repository: any = { create: jest.fn(), save: jest.fn() };
      const storageService: any = { createMultipartUpload };
      const service = new VideosService(repository, storageService);

      await expect(
        service.initiateUpload(
          'channel-1',
          makeDto({ size_bytes: 10 * 1024 * 1024 * 1024 + 1 }),
        ),
      ).rejects.toThrow(FileTooLargeException);
      expect(createMultipartUpload).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('computes partCount as ceil(size_bytes / 10MB)', async () => {
      const repository: any = {
        create: jest.fn((v) => v),
        save: jest.fn((v) => v),
      };
      const storageService: any = {
        createMultipartUpload: jest
          .fn()
          .mockResolvedValue({ uploadId: 'upload-1' }),
        getUploadPartUrls: jest.fn().mockResolvedValue([]),
      };
      const service = new VideosService(repository, storageService);

      // 25MB / 10MB per part => 3 parts
      await service.initiateUpload('channel-1', makeDto());

      expect(storageService.getUploadPartUrls).toHaveBeenCalledWith(
        expect.any(String),
        'upload-1',
        3,
      );
    });

    it('builds the storage key as videos/{channelId}/{videoId}/original.<ext>', async () => {
      const repository: any = {
        create: jest.fn((v) => v),
        save: jest.fn((v) => v),
      };
      const storageService: any = {
        createMultipartUpload: jest
          .fn()
          .mockResolvedValue({ uploadId: 'upload-1' }),
        getUploadPartUrls: jest.fn().mockResolvedValue([]),
      };
      const service = new VideosService(repository, storageService);

      await service.initiateUpload(
        'channel-42',
        makeDto({ original_filename: 'clip.mov' }),
      );

      const [key] = storageService.createMultipartUpload.mock.calls[0];
      expect(key).toMatch(
        /^videos\/channel-42\/[0-9a-f-]{36}\/original\.mov$/,
      );
    });

    it('persists a rascunho video row and returns id/upload_id/parts', async () => {
      const repository: any = {
        create: jest.fn((v) => v),
        save: jest.fn((v) => v),
      };
      const parts = [{ part_number: 1, url: 'https://signed-url' }];
      const storageService: any = {
        createMultipartUpload: jest
          .fn()
          .mockResolvedValue({ uploadId: 'upload-1' }),
        getUploadPartUrls: jest.fn().mockResolvedValue(parts),
      };
      const service = new VideosService(repository, storageService);

      const result = await service.initiateUpload('channel-1', makeDto());

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          channel_id: 'channel-1',
          original_filename: 'video.mp4',
          upload_id: 'upload-1',
        }),
      );
      expect(result.upload_id).toBe('upload-1');
      expect(result.parts).toBe(parts);
      expect(result.id).toHaveLength(12);
    });
  });
});
