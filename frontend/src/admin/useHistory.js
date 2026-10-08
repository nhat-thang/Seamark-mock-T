import { useEffect, useState } from 'react';
import { apiGet } from '../utils/api.js';

/**
 * Tải một trang lịch sử từ server theo bộ lọc.
 * filters: object các giá trị lọc (bỏ qua giá trị rỗng); page: số trang.
 */
export function useHistory(path, filters, page) {
  const [state, setState] = useState({ loading: true, error: '', items: [], page: 1, totalPages: 1, total: 0 });

  // Chuyển bộ lọc thành chuỗi ?a=1&b=2 (để useEffect so sánh được)
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  params.set('page', String(page));
  const query = params.toString();

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: '' }));
    apiGet(`${path}?${query}`)
      .then((data) => !cancelled && setState({ loading: false, error: '', ...data }))
      .catch((err) => !cancelled && setState((s) => ({ ...s, loading: false, error: err.message })));
    return () => {
      cancelled = true;
    };
  }, [path, query]);

  return state;
}
