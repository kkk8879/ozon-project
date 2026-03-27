import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return project status payload', () => {
      expect(appController.getHello()).toMatchObject({
        project: '雍金保理ozon电商管理系统',
        status: '运行正常',
        owner: 'Wong',
      });
      expect(typeof appController.getHello().time).toBe('string');
    });
  });
});
