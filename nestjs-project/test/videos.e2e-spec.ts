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
});
