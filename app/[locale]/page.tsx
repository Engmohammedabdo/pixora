import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function Home({ params }: PageProps): Promise<never> {
  const { locale } = await params;
  redirect(`/${locale}/dashboard`);
}
