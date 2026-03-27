import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const stores = await this.prisma.store.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const totalStores = stores.length;
    const activeStores = stores.filter((store) => store.isActive).length;
    const inactiveStores = stores.filter((store) => !store.isActive).length;

    const latestUpdatedStore =
      stores.length > 0
        ? {
            id: stores[0].id,
            name: stores[0].name,
            updatedAt: stores[0].updatedAt,
          }
        : null;

    return {
      totalStores,
      activeStores,
      inactiveStores,
      latestUpdatedStore,
    };
  }
}
