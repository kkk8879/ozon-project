import { PageEmpty } from '../../components/page-empty';
import { PageHeader } from '../../components/page-header';

export default function ProductsPage() {
  return (
    <div>
      <PageHeader
        title="雍金保理ozon电商管理系统 - 商品管理"
        description="商品中心能力建设中，敬请期待。"
      />
      <PageEmpty text="我们正在抓紧建设中" />
    </div>
  );
}

