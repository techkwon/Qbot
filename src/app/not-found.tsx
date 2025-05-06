import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">404 - 페이지를 찾을 수 없습니다</h1>
      <p className="mt-4 text-lg">요청하신 페이지를 찾을 수 없습니다.</p>
      <Link href="/" className="mt-6 rounded-md bg-blue-500 px-4 py-2 text-white hover:bg-blue-600">
        메인 페이지로 이동
      </Link>
    </div>
  );
}
