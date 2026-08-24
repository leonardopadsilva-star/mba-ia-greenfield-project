import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { cleanAllTables } from '../src/test/create-test-data-source';

describe('Videos (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new DomainExceptionFilter(),
      new ValidationExceptionFilter(),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  let counter = 0;
  async function registerConfirmAndLogin(): Promise<string> {
    counter += 1;
    const email = `videos_e2e_${counter}@example.com`;
    const password = 'password123';

    const authService = app.get(AuthService);
    const mailServiceInstance = (authService as any).mailService;
    let capturedToken = '';
    jest
      .spyOn(mailServiceInstance, 'sendConfirmationEmail')
      .mockImplementationOnce(async (_e: string, _n: string, t: string) => {
        capturedToken = t;
      });
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password });
    await request(app.getHttpServer())
      .get('/auth/confirm-email')
      .query({ token: capturedToken });
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    return res.body.access_token;
  }

  describe('POST /videos', () => {
    it('returns 201 with id, upload_id, and parts for a valid request', async () => {
      const token = await registerConfirmAndLogin();

      const res = await request(app.getHttpServer())
        .post('/videos')
        .set('Authorization', `Bearer ${token}`)
        .send({
          original_filename: 'video.mp4',
          content_type: 'video/mp4',
          size_bytes: 15 * 1024 * 1024,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toHaveLength(12);
      expect(res.body.upload_id).toBeTruthy();
      expect(res.body.parts).toHaveLength(2);
    }, 30000);

    it('returns 400 FILE_TOO_LARGE when size_bytes exceeds 10GB', async () => {
      const token = await registerConfirmAndLogin();

      const res = await request(app.getHttpServer())
        .post('/videos')
        .set('Authorization', `Bearer ${token}`)
        .send({
          original_filename: 'video.mp4',
          content_type: 'video/mp4',
          size_bytes: 10 * 1024 * 1024 * 1024 + 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('FILE_TOO_LARGE');
    }, 30000);

    it('returns 401 without an Authorization header', async () => {
      const res = await request(app.getHttpServer())
        .post('/videos')
        .send({
          original_filename: 'video.mp4',
          content_type: 'video/mp4',
          size_bytes: 1024,
        });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /videos/:publicId/complete', () => {
    async function initiateUpload(
      token: string,
      sizeBytes = 1024,
    ): Promise<{ id: string; parts: { part_number: number; url: string }[] }> {
      const res = await request(app.getHttpServer())
        .post('/videos')
        .set('Authorization', `Bearer ${token}`)
        .send({
          original_filename: 'video.mp4',
          content_type: 'video/mp4',
          size_bytes: sizeBytes,
        });
      return res.body;
    }

    it('returns 200 with status processando for a valid completion', async () => {
      const token = await registerConfirmAndLogin();
      const initiated = await initiateUpload(token);
      const putResponse = await fetch(initiated.parts[0].url, {
        method: 'PUT',
        body: 'a'.repeat(1024),
      });
      const etag = putResponse.headers.get('etag')!;

      const res = await request(app.getHttpServer())
        .post(`/videos/${initiated.id}/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parts: [{ part_number: 1, etag }] });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('processando');
    }, 30000);

    it('returns 404 VIDEO_NOT_FOUND for an unknown publicId', async () => {
      const token = await registerConfirmAndLogin();

      const res = await request(app.getHttpServer())
        .post('/videos/doesnotexist/complete')
        .set('Authorization', `Bearer ${token}`)
        .send({ parts: [{ part_number: 1, etag: 'x' }] });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('VIDEO_NOT_FOUND');
    });

    it('returns 403 FORBIDDEN when the caller does not own the video', async () => {
      const ownerToken = await registerConfirmAndLogin();
      const initiated = await initiateUpload(ownerToken);
      const otherToken = await registerConfirmAndLogin();

      const res = await request(app.getHttpServer())
        .post(`/videos/${initiated.id}/complete`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ parts: [{ part_number: 1, etag: 'x' }] });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    }, 30000);

    it('returns 409 UPLOAD_ALREADY_COMPLETED when completing twice', async () => {
      const token = await registerConfirmAndLogin();
      const initiated = await initiateUpload(token);
      const putResponse = await fetch(initiated.parts[0].url, {
        method: 'PUT',
        body: 'a'.repeat(1024),
      });
      const etag = putResponse.headers.get('etag')!;
      const parts = [{ part_number: 1, etag }];

      await request(app.getHttpServer())
        .post(`/videos/${initiated.id}/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parts });

      const res = await request(app.getHttpServer())
        .post(`/videos/${initiated.id}/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parts });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('UPLOAD_ALREADY_COMPLETED');
    }, 30000);
  });
});
