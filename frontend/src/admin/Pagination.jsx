// Nút chuyển trang: "Trang trước  Trang 2 / 5  Trang sau"
export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button type="button" className="btn btn-secondary btn-small" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Trang trước
      </button>
      <span>
        Trang {page} / {totalPages}
      </span>
      <button
        type="button"
        className="btn btn-secondary btn-small"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Trang sau
      </button>
    </div>
  );
}
