import { Link } from 'react-router-dom';
import { useAdmin } from './AdminLayout.jsx';

// Hướng dẫn sử dụng cho giáo viên — viết ngắn, từng bước, gọi đúng tên nút trên màn hình.
const SECTIONS = [
  { id: 'bat-dau', title: '1. Bắt đầu' },
  { id: 'tao-de', title: '2. Tạo đề mới bằng file Excel' },
  { id: 'anh-audio', title: '3. Thêm ảnh và audio' },
  { id: 'dap-an', title: '4. Nhập nhanh đáp án' },
  { id: 'sua-cau', title: '5. Sửa một câu hoặc một đoạn văn' },
  { id: 'xuat-ban', title: '6. Xem trước và xuất bản đề' },
  { id: 'tu-thiet-ke', title: '7. Đề tự thiết kế' },
  { id: 'nguoi-khac-sua', title: '8. Khi người khác đang sửa cùng đề' },
  { id: 'ket-qua', title: '9. Xem kết quả học viên' },
  { id: 'hoc-vien', title: '10. Học viên làm bài thế nào' },
  { id: 'admin-chinh', title: '11. Việc của admin chính' },
  { id: 'hoi-dap', title: '12. Câu hỏi thường gặp' },
];

export default function GuidePage() {
  const admin = useAdmin();

  return (
    <div className="guide">
      <h1 className="admin-title">Hướng dẫn sử dụng</h1>
      <p className="admin-intro">
        Đọc lần lượt từng phần. Chữ <strong>in đậm trong ngoặc kép</strong> là tên nút hoặc tên mục bạn sẽ thấy trên màn hình.
      </p>

      <nav className="card guide-toc" aria-label="Mục lục">
        <strong>Mục lục</strong>
        <ol>
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.title.replace(/^\d+\.\s*/, '')}</a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="bat-dau">
        <ol>
          <li>Vào trang web, bấm <B>Đăng nhập admin</B>, nhập tên đăng nhập và mật khẩu được cấp.</li>
          <li>
            Lần đầu đăng nhập, hãy vào <B>Đổi mật khẩu</B> (menu phía trên) và đặt mật khẩu của riêng bạn, ít nhất 8 ký tự.
          </li>
          <li>Dùng xong trên máy dùng chung, bấm <B>Đăng xuất</B> ở góc phải phía trên.</li>
        </ol>
        <Tip>Nhập sai mật khẩu 5 lần liền sẽ bị chặn 15 phút. Quên mật khẩu thì nhờ admin chính đặt lại.</Tip>
      </Section>

      <Section id="tao-de">
        <ol>
          <li>Vào <B>Đề thi</B> → bấm <B>Tạo đề mới</B> → điền mã đề (ví dụ READING-02), tên đề, thời gian → <B>Tạo đề</B>.</li>
          <li>
            Ở trang đề vừa tạo, mở tab <B>Import Excel</B> → bấm vào chữ <B>mau-de-toeic.xlsx</B> để tải file mẫu về máy.
          </li>
          <li>
            Mở file mẫu bằng Excel và điền đề. Đọc trang «Hướng dẫn» trong file. Lưu ý:
            <ul>
              <li>Không đổi tên các trang và tên các cột, không sửa các cột màu xám (số câu, Part, mã nhóm).</li>
              <li>Part 1 chỉ cần đáp án và tên file ảnh. Part 2 chỉ cần đáp án A, B hoặc C.</li>
              <li>Đoạn văn Part 6, 7 điền ở trang «Nhóm câu»: gõ chữ, hoặc ghi tên file ảnh chụp đoạn văn.</li>
              <li>Chỉ ghi <em>tên</em> file (ví dụ <code>q1.jpg</code>), không ghi đường dẫn.</li>
              <li>Chưa điền xong cũng được, có thể tải lên nhiều lần.</li>
            </ul>
          </li>
          <li>Kéo file Excel đã điền vào ô có viền nét đứt (hoặc bấm vào ô đó để chọn file).</li>
          <li>
            Đọc kết quả:
            <ul>
              <li><strong>Ô màu đỏ</strong> = file có lỗi (ví dụ đáp án ghi "E"). Sửa trong Excel rồi tải lên lại. Lúc này chưa có gì bị thay đổi.</li>
              <li><strong>Ô màu cam</strong> = còn thiếu (thiếu đáp án, thiếu ảnh…). Vẫn áp dụng được, bổ sung sau.</li>
            </ul>
          </li>
          <li>Kiểm tra bảng xem trước, rồi bấm <B>Áp dụng vào bản nháp</B>.</li>
        </ol>
        <Tip>Áp dụng file Excel sẽ thay toàn bộ câu hỏi đang có trong bản nháp bằng nội dung file.</Tip>
      </Section>

      <Section id="anh-audio">
        <ol>
          <li>Mở tab <B>Ảnh & audio</B>.</li>
          <li>
            Chọn cùng lúc tất cả ảnh và file audio (mp3, m4a, wav, jpg, png, webp) rồi kéo vào ô có viền nét đứt.
          </li>
          <li>
            File có tên trùng với tên đã ghi trong Excel sẽ <strong>tự khớp</strong> vào đúng câu: bảng "Các chỗ cần file trong đề"
            hiện <B>Đã có</B>.
          </li>
          <li>
            Chỗ nào còn <B>Chưa tải lên</B> hoặc <B>Trống</B>: tải thêm file, hoặc chọn file ở cột <B>Gán file khác</B>.
          </li>
          <li>Tải lên một file cùng tên với file cũ thì file mới sẽ thay file cũ.</li>
          <li>
            <strong>Audio phần nghe</strong> còn có thể tải ngay ở tab <B>Thông tin đề</B>, mục "Audio phần nghe": chọn <B>Một file audio
            cho cả phần nghe</B> hoặc <B>Mỗi Part một file riêng</B>, bấm <B>Tải audio mới lên</B>, rồi bấm nút phát để nghe thử.
          </li>
        </ol>
      </Section>

      <Section id="dap-an">
        <p>Mở tab <B>Nhập nhanh đáp án</B>. Có hai cách:</p>
        <ul>
          <li>
            <strong>Bấm chọn:</strong> bấm chữ A/B/C/D cạnh số câu. Bấm lại lần nữa để bỏ chọn.
          </li>
          <li>
            <strong>Dán chuỗi:</strong> dán vào ô <B>Dán chuỗi đáp án</B> theo dạng <code>101A 102C 103B</code>, hoặc chỉ các chữ cái
            <code>ACBD…</code> rồi điền số câu bắt đầu. Bấm <B>Xem trước</B>, kiểm tra, rồi bấm <B>Áp dụng</B>.
          </li>
        </ul>
        <Tip>Mọi thay đổi được tự động lưu sau khoảng 2 giây. Dòng chữ cạnh tên đề cho biết "Đã lưu lúc …".</Tip>
      </Section>

      <Section id="sua-cau">
        <ol>
          <li>Mở tab <B>Câu hỏi & đoạn văn</B>.</li>
          <li>
            <strong>Sửa câu:</strong> bấm số câu ở cột bên trái (viền đỏ = chưa có đáp án), sửa câu hỏi, lựa chọn, đáp án, giải
            thích ở bên phải.
          </li>
          <li>
            <strong>Sửa đoạn văn:</strong> bấm <B>Nhóm câu / đoạn văn</B>, chọn nhóm (ví dụ P7-D01), sửa ô <B>Đoạn văn (chữ)</B>.
            Phía dưới có phần xem trước.
          </li>
          <li>
            <strong>Thêm ảnh ngay tại chỗ:</strong> ô ảnh của câu và ô <B>Ảnh kèm</B> có nút <B>Tải ảnh mới lên</B> (tải xong tự gán
            vào ô đó); mục ảnh đoạn văn có nút <B>Tải ảnh đoạn văn lên</B> (chọn được nhiều ảnh, ảnh được thêm theo thứ tự).
          </li>
        </ol>
        <p>Cách viết đặc biệt trong đoạn văn:</p>
        <ul>
          <li>Một dòng chỉ có <code>---</code>: ngăn cách các văn bản (đoạn đôi, đoạn ba).</li>
          <li>Dòng bắt đầu bằng <code>|</code>: một hàng của bảng, ví dụ <code>| Item | Price</code>.</li>
          <li><code>__(131)__</code>: chỗ trống của câu 131 (Part 6).</li>
        </ul>
      </Section>

      <Section id="xuat-ban">
        <ol>
          <li>Bấm <B>Xem trước</B> (góc phải phía trên) để xem đề giống hệt học viên. Tick <B>Hiện đáp án và giải thích</B> để rà lại.</li>
          <li>Mở tab <B>Kiểm tra & xuất bản</B>. Nếu còn lỗi, danh sách lỗi sẽ ghi rõ câu nào, thiếu gì.</li>
          <li>Hết lỗi thì bấm <B>Xuất bản</B>. Học viên thấy đề ngay.</li>
          <li>
            Sửa đề đã xuất bản: cứ sửa bình thường (học viên vẫn làm bản cũ), xong bấm <B>Xuất bản lại</B>. Ai đang làm dở vẫn làm
            tiếp bản cũ.
          </li>
          <li>Muốn ẩn đề khỏi danh sách của học viên: bấm <B>Ngừng mở đề</B>.</li>
          <li>
            <B>Xóa đề</B> (nút <B>Xóa</B> ở danh sách đề, hoặc cuối tab "Kiểm tra & xuất bản"): xóa hẳn đề cùng mọi kết quả của học viên,
            không khôi phục được. Web hỏi lại "Bạn có chắc chắn…", rồi yêu cầu gõ lại mã đề. Mỗi lần xóa được ghi vào lịch sử chỉnh sửa.
          </li>
          <li>
            Đề TOEIC: tab <B>Thông tin đề</B>, mục "Tên và lời dặn từng Part" — học viên thấy tên Part và lời dặn ngay trước câu đầu tiên
            của mỗi Part.
          </li>
        </ol>
        <Tip>
          Tab <B>Thông tin đề</B> có ô "Cho học viên xem đáp án và giải thích sau khi nộp bài" và "Cho học viên tua audio". Đổi xong cũng
          phải bấm Xuất bản lại thì học viên mới thấy thay đổi. <B>Ghi chú nội bộ</B> chỉ admin thấy.
        </Tip>
      </Section>

      <Section id="tu-thiet-ke">
        <p>
          Khi bấm <B>Tạo đề mới</B>, chọn <B>Đề tự thiết kế</B> nếu muốn tự đặt số câu và cách chia phần (bài kiểm tra từ vựng, ngữ
          pháp, đọc hiểu…). Lần đầu vào trang soạn đề sẽ có <strong>hướng dẫn từng bước</strong> chỉ vào từng nút; có thể bấm{' '}
          <B>Bỏ qua hướng dẫn</B>, và xem lại bất cứ lúc nào bằng nút <B>Xem lại hướng dẫn</B>.
        </p>
        <ol>
          <li>Tab <B>Soạn đề</B>: bên trái là dàn ý đề, bên phải là khung soạn.</li>
          <li>Bấm tên phần để đổi tên, viết lời dặn, gắn audio cho cả phần. Bấm <B>Thêm phần</B> để chia đề thành nhiều phần.</li>
          <li>
            <B>Thêm câu</B>: gõ câu hỏi (hoặc chỉ dùng ảnh / audio), nhập các lựa chọn, bấm <B>Đáp án đúng</B> ở lựa chọn đúng. Dùng{' '}
            <B>Thêm lựa chọn</B> / <B>Bớt lựa chọn cuối</B> để có từ 2 đến 6 lựa chọn (2 lựa chọn dùng cho câu Đúng/Sai).
          </li>
          <li><B>Thêm nhóm đọc hiểu</B>: một đoạn văn (chữ, ảnh hoặc audio) kèm nhiều câu; bấm <B>Thêm câu vào nhóm</B>.</li>
          <li>Nút <B>Lên</B> / <B>Xuống</B> đổi thứ tự; số câu tự đánh lại.</li>
          <li>
            Tab <B>Thông tin đề</B>: bật <B>Xáo trộn câu hỏi</B> để mỗi học viên làm một thứ tự khác nhau (xáo trong từng phần, câu của
            cùng nhóm luôn liền nhau).
          </li>
        </ol>
        <p>
          <strong>Khung mẫu:</strong> soạn xong một đề, vào tab <B>Kiểm tra & xuất bản</B>, mục "Khung mẫu", đặt tên rồi bấm{' '}
          <B>Lưu thành khung mẫu</B> (không bắt buộc, lúc nào mở lại đề cũng lưu / cập nhật / bỏ được). Khung hiện trong{' '}
          <B>Tạo đề mới</B>: chọn khung là có ngay đề mới cùng cấu trúc (part, số question, số lựa chọn, nhóm đọc hiểu, thời gian),
          nội dung để trống để soạn đề khác.
        </p>
        <Tip>Đề tự thiết kế chấm theo số câu đúng và điểm thang 10 (ví dụ 32/40 câu = 8 điểm), có số câu đúng từng phần.</Tip>
      </Section>

      <Section id="nguoi-khac-sua">
        <p>Mỗi đề chỉ một người sửa tại một thời điểm.</p>
        <ul>
          <li>
            Nếu thấy dòng "<em>Cô X đang chỉnh sửa đề này từ …</em>", bạn chỉ xem được. Đợi người đó xong (đóng trang) rồi bấm{' '}
            <B>Bắt đầu chỉnh sửa</B>.
          </li>
          <li>
            Trường hợp gấp (ví dụ người đó quên đóng máy), bấm <B>Giành quyền chỉnh sửa</B>. Người kia sẽ được báo trên màn hình và
            những gì họ chưa lưu sẽ không được lưu.
          </li>
          <li>Nếu bạn bị người khác giành quyền, màn hình sẽ báo và chuyển sang chế độ chỉ xem.</li>
        </ul>
      </Section>

      <Section id="ket-qua">
        <ol>
          <li>Vào <B>Kết quả</B>. Lọc theo tên (gõ có dấu hoặc không dấu đều được), số điện thoại, đề, ngày.</li>
          <li>Bấm vào tên học viên để xem từng câu: chọn gì, đúng hay sai, và các lần làm khác của học viên đó.</li>
          <li>
            Bấm <B>Xuất Excel</B> để tải file theo bộ lọc đang chọn. File có 2 trang: «Kết quả» (điểm) và «Đáp án từng câu» (ô xanh =
            đúng, ô đỏ = sai).
          </li>
        </ol>
        <Tip>
          Điểm quy đổi trên web là <strong>điểm ước tính</strong>, không phải điểm TOEIC chính thức. Điểm quy đổi chỉ có khi phần đó đủ
          100 câu.
        </Tip>
      </Section>

      <Section id="hoc-vien">
        <ol>
          <li>Học viên vào trang web → <B>Bắt đầu làm bài</B> → nhập họ, tên, số điện thoại → <B>Tiếp tục</B> → chọn đề → <B>Làm bài</B>.</li>
          <li>Đồng hồ bắt đầu chạy ngay. Hết giờ, bài <strong>tự nộp và tự chấm</strong>.</li>
          <li>Bài làm được tự động lưu. Lỡ tải lại trang hay mất mạng, mở lại vẫn còn bài.</li>
          <li>Đóng trình duyệt giữa chừng: vào lại với <strong>đúng số điện thoại cũ</strong> và chọn đúng đề đó để làm tiếp (thời gian vẫn tính tiếp).</li>
          <li>Ô <B>Cần xem lại</B> giúp học viên đánh dấu câu muốn xem lại. Bảng số câu: xanh = đã làm, trắng = chưa làm, viền cam = cần xem lại.</li>
          <li>Phần nghe: nếu đề không cho tua, học viên chỉ bấm được <B>Phát audio</B> / <B>Tạm dừng</B>.</li>
        </ol>
      </Section>

      <Section id="admin-chinh">
        {admin.role !== 'owner' && <p className="muted">Phần này dành cho admin chính. Bạn không thấy các mục này trong menu.</p>}
        <ul>
          <li>
            <B>Tài khoản admin</B>: tạo tài khoản cho giáo viên (tên hiển thị, tên đăng nhập, mật khẩu), <B>Vô hiệu hóa</B> /{' '}
            <B>Mở lại</B> tài khoản, <B>Đặt lại mật khẩu</B> khi có người quên.
          </li>
          <li>
            <B>Lịch sử chỉnh sửa</B>: ai đã tạo đề, sửa đề, import Excel, xuất bản, xuất kết quả… lúc nào.
          </li>
          <li>
            <B>Lịch sử đăng nhập</B>: ai đăng nhập lúc nào, từ đâu, các lần nhập sai. Thấy nhiều lần sai lạ thì đổi mật khẩu tài khoản đó.
          </li>
          <li>Admin chính quên mật khẩu: nhờ người quản lý máy chủ đặt lại (có lệnh riêng trên máy chủ).</li>
        </ul>
      </Section>

      <Section id="hoi-dap">
        <dl className="guide-faq">
          <dt>Tôi sửa đề rồi mà học viên vẫn thấy bản cũ?</dt>
          <dd>Bạn cần bấm <B>Xuất bản lại</B> ở tab "Kiểm tra & xuất bản".</dd>
          <dt>Dòng chữ cạnh tên đề báo "Mất kết nối, đã lưu tạm trên máy"?</dt>
          <dd>Mạng đang chập chờn. Đừng đóng trang; khi có mạng lại, web tự lưu lên. Nếu lỡ đóng, mở lại đề trên cùng máy sẽ được khôi phục.</dd>
          <dt>Báo "Đề vừa được lưu ở nơi khác"?</dt>
          <dd>Có người (hoặc chính bạn ở tab / máy khác) vừa sửa đề này. Bấm <B>Tải lại trang</B> để xem bản mới nhất rồi sửa tiếp.</dd>
          <dt>Học viên nhập sai số điện thoại?</dt>
          <dd>Mỗi số điện thoại là một học viên. Nhập sai số thì bài làm sẽ nằm ở số đó; tìm theo tên trong mục Kết quả.</dd>
          <dt>Xuất bản báo thiếu file?</dt>
          <dd>Vào tab <B>Ảnh & audio</B>, xem các dòng "Chưa tải lên" và tải đúng file đó lên (tên file phải giống tên ghi trong đề).</dd>
        </dl>
      </Section>

      <p className="guide-back">
        <a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Lên đầu trang</a>
        {' · '}
        <Link to="/admin">Về trang chính</Link>
      </p>
    </div>
  );
}

function Section({ id, children }) {
  const title = SECTIONS.find((s) => s.id === id).title;
  return (
    <section id={id} className="card guide-section">
      <h2 className="admin-section-title">{title}</h2>
      {children}
    </section>
  );
}

// Tên nút / mục trên màn hình
const B = ({ children }) => <strong className="guide-btn">"{children}"</strong>;

function Tip({ children }) {
  return <p className="guide-tip"><strong>Lưu ý:</strong> {children}</p>;
}
