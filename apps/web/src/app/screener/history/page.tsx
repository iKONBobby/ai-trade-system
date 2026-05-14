import { redirect } from 'next/navigation';

export default function ScreenerHistoryRedirect() {
  redirect('/screener?tab=history');
}
