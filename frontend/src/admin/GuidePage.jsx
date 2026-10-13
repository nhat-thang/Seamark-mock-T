import { Link } from 'react-router-dom';
import { useAdmin } from './AdminLayout.jsx';

// Hướng dẫn sử dụng cho giáo viên — viết ngắn, từng bước, gọi đúng tên nút trên màn hình.
const SECTIONS = [
  { id: 'bat-dau', title: '1. Bắt đầu' },
  { id: 'lich-day', title: '2. Xem lịch dạy và thông báo' },
  { id: 'diem-danh', title: '3. Điểm danh một buổi học' },
  { id: 'lop-hoc', title: '4. Lớp học và học sinh' },
  { id: 'hoc-phi', title: '5. Học phí: cảnh báo, thu tiền, quản lý theo tháng' },
  { id: 'xep-lich', title: '6. Xếp thời khóa biểu (admin chính)' },
  { id: 'tao-de', title: '7. Tạo đề mới bằng file Excel' },
  { id: 'anh-audio', title: '8. Thêm ảnh và audio' },
  { id: 'dap-an', title: '9. Nhập nhanh đáp án' },
  { id: 'sua-cau', title: '10. Sửa một câu hoặc một đoạn văn' },
  { id: 'xuat-ban', title: '11. Xem trước và xuất bản đề' },
  { id: 'tu-thiet-ke', title: '12. Đề tự thiết kế' },
  { id: 'homework', title: '13. Đề Class Assignment (đề riêng của lớp)' },
  { id: 'nguoi-khac-sua', title: '14. Khi người khác đang sửa cùng đề' },
  { id: 'ket-qua', title: '15. Xem kết quả học viên' },
  { id: 'hoc-vien', title: '16. Học viên làm bài thế nào' },
  { id: 'admin-chinh', title: '17. Việc của admin chính' },
  { id: 'hoi-dap', title: '18. Câu hỏi thường gặp' },
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

      <Section id="lich-day">
        <ol>
          <li>
            Mở <B>Trang chính</B>: khung <B>Lịch dạy của bạn</B> liệt kê các buổi bạn dạy trong 7 ngày tới. Khung đỏ{' '}
            <B>Buổi chưa điểm danh</B> nhắc các buổi đã hết giờ mà bạn chưa điểm danh.
          </li>
          <li>
            Vào <B>Thời khóa biểu</B> để xem cả tuần (Thứ 2 → Chủ nhật). Bấm mũi tên ‹ › để xem tuần trước / tuần sau, hoặc chọn ngày ở ô{' '}
            <B>Đi tới ngày</B>.
          </li>
          <li>
            Chọn <B>Lịch dạy của tôi</B> để chỉ xem buổi bạn dạy, hoặc <B>Tất cả các lớp</B> để xem lịch cả trung tâm (kể cả giáo viên
            khác). Buổi bạn dạy có <strong>viền đậm</strong>. Bạn bấm mở được buổi mình dạy và mọi buổi của <strong>lớp mình phụ
            trách</strong>; buổi của lớp khác chỉ xem.
          </li>
          <li>
            Biểu tượng <B>chuông</B> ở góc trên bên phải: có số màu vàng là có việc mới — buổi dạy trong 24 giờ tới, buổi chưa điểm danh,
            hoặc admin chính vừa xếp / đổi lịch cho bạn. Chuông rung khi sắp tới giờ vào lớp.
          </li>
          <li>
            Muốn máy tính / điện thoại tự báo trước giờ dạy: bấm chuông → <B>Bật thông báo trên máy này</B> → chọn <B>Cho phép</B>. Máy sẽ
            báo trước 1 tiếng và lúc bấm "Bắt đầu" được (chỉ khi trang web đang mở trong trình duyệt).
          </li>
        </ol>
      </Section>

      <Section id="diem-danh">
        <ol>
          <li>Tới giờ dạy, bấm vào buổi học (ở Trang chính, Thời khóa biểu hoặc chuông).</li>
          <li>
            Bấm nút vàng <B>Bắt đầu buổi học</B>. Nút này chỉ bấm được từ <strong>30 phút trước giờ học</strong>; trước đó màn hình
            hiện "Chưa tới giờ học" và đếm ngược.
          </li>
          <li>
            Tab <B>Điểm danh</B>: bấm <B>Cả lớp có mặt</B>, rồi chỉ cần bấm lại cho các bạn <B>Đi muộn</B>, <B>Vắng có phép</B> hoặc{' '}
            <B>Vắng không phép</B>.
          </li>
          <li>Tab <B>Điểm cộng</B>: bấm <B>+</B> mỗi khi học sinh phát biểu tốt, làm bài tốt (bấm <B>−</B> nếu lỡ tay).</li>
          <li>
            Cạnh tên mỗi học sinh có <B>số buổi đã học</B> và nhãn <B>cảnh báo học phí</B> (vàng / cam / đỏ, luôn kèm chữ) để bạn nhắc
            phụ huynh. Có học sinh mới vào lớp thì báo admin chính thêm vào lớp.
          </li>
          <li>
            Cuối cùng bấm <B>Lưu điểm danh</B> (thanh màu xanh đậm ở cuối màn hình). Thấy chữ "✓ Đã lưu điểm danh" là xong. Còn bạn
            nào chưa điểm danh thì web sẽ hỏi trước khi lưu.
          </li>
        </ol>
        <Tip>
          Lỡ tải lại trang khi chưa bấm lưu: mở lại buổi học trên cùng máy, các ô đã tích vẫn còn. Bạn sửa được điểm danh tới{' '}
          <strong>hết ngày hôm sau</strong> ngày học (buổi admin chính thêm bù vào ngày đã qua: hết ngày hôm sau ngày thêm); sau đó cần
          sửa thì nhờ admin chính. Buổi của giáo viên ngoài (không có tài khoản) do giáo viên phụ trách lớp hoặc admin chính điểm danh.
        </Tip>
      </Section>

      <Section id="lop-hoc">
        <p>
          Giáo viên thấy các <strong>lớp mình phụ trách</strong>: học sinh, số buổi đã học, điểm danh, điểm cộng, nhãn học phí. Thông
          tin phụ huynh và số tiền chỉ admin chính thấy. Chỉ <strong>admin chính</strong> tạo / sửa lớp và thêm / sửa học sinh.
        </p>
        <ol>
          <li>
            (Admin chính) Vào <B>Lớp học</B> → <B>Tạo lớp mới</B> → nhập tên lớp, chọn <B>giáo viên phụ trách</B> (chọn được nhiều
            người), điền học phí (<B>mỗi kì gồm … buổi</B>, <B>học phí mỗi buổi</B>), chọn màu → <B>Tạo lớp</B>. Chưa biết học phí thì để
            trống, cài sau ở <B>Sửa thông tin lớp</B>.
          </li>
          <li>
            Trong lớp, tab <B>Học sinh</B> → <B>Thêm học sinh</B>: phải điền đủ <B>họ tên học sinh</B>, <B>tên phụ huynh</B>,{' '}
            <B>SĐT phụ huynh</B> (10 số) và <B>CCCD phụ huynh</B> (12 số). Có thể ghi giảm giá (%) cho học sinh đặc biệt.
          </li>
          <li>
            <B>Buổi bắt đầu học</B>: mặc định là buổi sắp tới gần nhất của lớp, đổi được. Học phí tính từ buổi này; học sinh chỉ có tên
            trong điểm danh từ buổi này.
          </li>
          <li>
            <B>Nhập từ Excel</B>: chọn file danh sách lớp bạn đang có. Chỉ cột họ tên là bắt buộc; web tự nhận cột tên phụ huynh, SĐT,
            CCCD. Cột lạ (ngày sinh, trường…) được gộp vào Ghi chú. Học sinh còn thiếu thông tin hiện nhãn vàng{' '}
            <B>Thiếu thông tin</B> — bấm <B>Sửa</B> để bổ sung (khi sửa thì không bắt buộc điền đủ).
          </li>
          <li>
            Bấm chữ <B>vắng 2</B> (màu đỏ, cột "Đã học") để xem học sinh vắng những buổi nào. Bấm <B>Chi tiết</B> hoặc tên học sinh để
            xem từng buổi đi học và các bài đã làm.
          </li>
          <li>
            <B>Cho nghỉ</B>: bạn đó không còn trong điểm danh các buổi sau, lịch sử cũ (điểm danh, học phí) vẫn giữ. Xem lại ở "Học
            sinh đã nghỉ", bấm <B>Cho học lại</B> nếu bạn quay lại.
          </li>
          <li>
            <B>Tải danh sách lớp (Excel)</B>: admin chính tải được đủ thông tin; giáo viên tải được tên + số buổi + trang điểm danh từng
            buổi.
          </li>
          <li>Tab <B>Lịch học</B>: thời khóa biểu riêng của lớp. Tab <B>Các buổi học</B>: các buổi (đánh số Buổi 1, 2, 3…) và số bạn có mặt.</li>
        </ol>
        <Tip>
          <B>Xóa lớp</B> chỉ ẩn lớp đi (học sinh, lịch, điểm danh vẫn còn). Admin chính khôi phục được ở <B>Lớp học</B> →{' '}
          <B>Xem lớp đã xóa</B>.
        </Tip>
      </Section>

      <Section id="hoc-phi">
        <p>
          <strong>Cách tính, nói ngắn gọn:</strong> mỗi lớp chia thành các <strong>kì</strong>, mỗi kì gồm một số buổi (ví dụ 8
          buổi). Học sinh <strong>đóng trước</strong> mỗi kì. Buổi học đếm theo <strong>thời khóa biểu</strong> — học sinh vắng vẫn
          tính buổi đó.
        </p>
        <ol>
          <li>
            Ví dụ lớp 8 buổi / kì, 150.000đ / buổi: kì 1 = buổi 1–8, kì 2 = buổi 9–16… Hạn đóng kì 2 là <strong>ngày học buổi
            8</strong> (buổi cuối của kì 1). Học sinh mới vào thì hạn kì đầu là ngày buổi bắt đầu học.
          </li>
          <li>
            Vào giữa kì (ví dụ từ buổi 6): kì đầu chỉ tính buổi 6, 7, 8 = 3 buổi. Số tiền = số buổi × học phí / buổi, trừ giảm giá nếu có.
          </li>
          <li>
            <strong>Cảnh báo</strong> (hiện ở Trang chính, điểm danh, danh sách học sinh — luôn có chữ đi kèm màu):
            <ul>
              <li><B>Vàng</B>: còn 4, 3 hoặc 2 buổi nữa là tới hạn đóng kì sau.</li>
              <li><B>Cam</B>: còn 1 buổi.</li>
              <li><B>Đỏ</B>: đã tới hạn mà chưa đóng. Đỏ kéo dài tới hết buổi thứ 3 của kì mới rồi thôi (trang Quản lý học phí vẫn ghi "Chưa đóng").</li>
            </ul>
          </li>
          <li>
            Lớp chưa xếp đủ lịch của một kì thì chưa thu được kì đó; Trang chính của admin chính nhắc "Lớp … mới xếp 6/8 buổi".
          </li>
        </ol>
        <h3 className="guide-sub">Thu tiền (admin chính)</h3>
        <ol>
          <li>
            Vào <B>Quản lý học phí</B> (menu admin chính) → bấm vào lớp → bấm <B>Thu kì …</B> ở dòng học sinh. Hoặc vào lớp → tab{' '}
            <B>Học phí</B> → <B>Thu / xem</B>.
          </li>
          <li>
            Kiểm tra số tiền (web tự tính sẵn), ngày thu, chọn <B>Tiền mặt</B> hoặc <B>Chuyển khoản</B>, ghi chú nếu cần →{' '}
            <B>Xác nhận đã thu</B>. Số tiền được <strong>chốt</strong> lúc này; sau đổi giá hay đổi lịch cũng không thay đổi.
          </li>
          <li>
            Ghi nhầm: bấm <B>Bỏ "Đã thu"</B> → <strong>nhập lại mật khẩu đăng nhập của bạn</strong> → kì đó quay về "Chưa đóng". Mọi
            lần thu / bỏ thu đều ghi vào <B>Lịch sử thu</B>.
          </li>
          <li>
            <B>Tắt cảnh báo</B> (ví dụ phụ huynh đã hẹn ngày đóng): bấm <B>Tắt cảnh báo</B> ở Trang chính hoặc ở kì đó. Cảnh báo của kì
            đó ẩn hẳn; kì sau vẫn cảnh báo bình thường. Bật lại được bất cứ lúc nào.
          </li>
        </ol>
        <h3 className="guide-sub">Trang Quản lý học phí (admin chính)</h3>
        <ol>
          <li>Chọn tháng (nút <B>Tháng trước</B> / <B>Tháng sau</B>). Trên cùng là tổng <B>Cần thu</B>, <B>Đã thu</B>, <B>Còn thiếu</B> của cả trung tâm.</li>
          <li>
            Mỗi lớp là một khối: giáo viên, số buổi đã học, cần thu / đã thu / còn thiếu (hoặc "Chưa đến hạn"). Bấm vào khối để xem từng
            học sinh: buổi bắt đầu, số buổi đã học, buổi nghỉ trong tháng (bấm để xem ngày), số tiền, ngày thu, hình thức, trạng thái
            (<B>Đã thu</B> xanh / <B>Chưa đóng</B> vàng / <B>Chưa đến hạn</B> xám).
          </li>
          <li>"Cần thu trong tháng" = tiền các kì có <strong>hạn đóng</strong> rơi vào tháng đó. Học sinh còn nợ kì trước có dòng đỏ "Còn nợ kì …".</li>
          <li>Bấm <B>Tải Excel tháng …</B> để tải cả bảng; <B>Lịch sử thu</B> của từng học sinh cũng tải được Excel.</li>
        </ol>
      </Section>

      <Section id="xep-lich">
        {admin.role !== 'owner' && <p className="muted">Phần này dành cho admin chính. Bạn chỉ xem được thời khóa biểu.</p>}
        <ol>
          <li>
            Vào <B>Thời khóa biểu</B> → <B>Xếp lịch học</B> (hoặc <B>Thêm buổi</B> ở đúng ngày). Chọn lớp, ngày, giờ bắt đầu, giờ kết
            thúc (bấm nhanh "1 giờ 30" để tự điền giờ kết thúc).
          </li>
          <li>
            <strong>Bắt buộc có giáo viên</strong>: tích một hoặc nhiều giáo viên (dạy cùng buổi), và / hoặc gõ tên giáo viên ngoài
            (không có tài khoản). Giáo viên được xếp dạy tự thành giáo viên phụ trách lớp và nhận thông báo trên web.
          </li>
          <li>
            Lớp học cố định hằng tuần: tích <B>Lặp lại hằng tuần</B>, chọn các thứ (ví dụ T2, T4, T6) và ngày kết thúc (hoặc bấm "3
            tháng"). Hết hạn thì xếp tiếp từ ngày sau đó.
          </li>
          <li>
            Web hỏi lại trước khi lưu nếu: trùng giờ với buổi khác; thêm buổi vào ngày <strong>đã qua</strong> (buổi đó sẽ được tính
            tiền); hoặc việc thêm / xóa buổi làm <strong>đánh số lại</strong> các buổi và lệch kì học phí đã thu (web nêu tên học sinh,
            số tiền đã thu giữ nguyên). Chắc chắn thì bấm <B>Vẫn xếp lịch</B> / <B>Vẫn xóa</B>.
          </li>
          <li>
            Sửa / xóa: bấm vào buổi học → <B>Sửa lịch</B> hoặc <B>Xóa buổi</B>. Với lịch lặp lại, chọn "Chỉ buổi này" hoặc "Buổi này và
            các buổi sau".
          </li>
          <li>
            Buổi <strong>đã điểm danh</strong>: không xóa được, không đổi được ngày giờ (để giữ đúng số buổi và học phí). Vẫn đổi được
            giáo viên, phòng học, ghi chú.
          </li>
          <li>Bấm vào bất kỳ buổi nào để xem danh sách học sinh và tình hình điểm danh; nút <B>Tải Excel buổi này</B> để tải về.</li>
        </ol>
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
          <li>
            Tab <B>Soạn đề</B>: đề hiện thành các thẻ xếp dọc. Bấm vào một thẻ để soạn ngay trên thẻ đó. Thanh nút nhỏ bên phải đi theo thẻ
            đang chọn; thứ mới thêm nằm ngay dưới thẻ đang chọn. Thẻ trên cùng là tên đề và mô tả đề (học viên thấy trước khi làm bài).
          </li>
          <li>
            <B>⊕ Thêm câu hỏi</B>: gõ câu hỏi (hoặc chỉ dùng ảnh / audio), gõ các lựa chọn. Nhấn <B>Enter</B> để thêm lựa chọn mới; xóa hết
            chữ rồi nhấn <B>Backspace</B> để bỏ lựa chọn đó. Có từ 2 đến 6 lựa chọn (2 lựa chọn dùng cho câu Đúng/Sai). Biểu tượng ảnh cạnh
            ô câu hỏi để chèn ảnh hoặc audio; di chuột vào một lựa chọn để chèn ảnh cho lựa chọn đó.
          </li>
          <li>
            Bấm <B>Đáp án</B> ở chân thẻ: bấm vào lựa chọn đúng (có dấu ✓ xanh), gõ số điểm của câu, có thể thêm phản hồi (giải thích), rồi
            bấm <B>Xong</B>. Câu chưa có đáp án có dòng chữ đỏ dưới thẻ. Tổng điểm của đề ở thanh trên cùng.
          </li>
          <li>
            Ô loại câu hỏi bên phải: <B>Trắc nghiệm</B>, <B>Trả lời ngắn</B>, <B>Đoạn / Trả lời dài</B>. Hiện học viên mới làm được câu trắc
            nghiệm; hai loại còn lại soạn được nhưng chưa xuất bản được (sẽ có ở bản cập nhật tới).
          </li>
          <li>
            <B>Tт Thêm tiêu đề và mô tả</B> (hoặc nút thêm ảnh / thêm audio): một đoạn văn, ảnh hoặc bài nghe dùng cho nhiều câu. Thêm câu
            ngay bên dưới khối: các câu có <strong>vạch nối bên trái</strong> thuộc khối đó, học viên thấy khối bên cạnh các câu này. Nút ⋮
            của câu có <B>Tách khỏi khối ở trên</B> / <B>Gắn vào khối ở trên</B>.
          </li>
          <li>
            <B>Thêm phần</B> (nút dưới cùng của thanh bên phải): chia đề thành nhiều part. Bấm vào thẻ đầu part để đổi tên, viết lời dặn,
            gắn audio cho cả part; nút ⋮ để chuyển part lên / xuống.
          </li>
          <li>
            Đổi thứ tự: giữ chuột vào <strong>6 chấm</strong> ở mép trên thẻ rồi kéo, hoặc bấm vào 6 chấm rồi dùng phím mũi tên ↑ ↓. Số câu
            tự đánh lại.
          </li>
          <li>
            Xóa thẻ bằng biểu tượng thùng rác; lỡ tay thì bấm <B>Hoàn tác</B> ở thanh báo góc dưới màn hình. Muốn xóa nhiều câu: bấm{' '}
            <B>Chọn nhiều để xóa</B> ở thanh trên cùng.
          </li>
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
        <p>
          <strong>Dán đề có sẵn:</strong> có đề trắc nghiệm trên trang web, file Word hay PDF thì không cần gõ lại từng câu.
        </p>
        <ol>
          <li>
            Mở đề, bấm Ctrl + A rồi Ctrl + C để copy. Trong tab <B>Soạn đề</B>, bấm <B>Dán đề có sẵn</B> ở đầu trang (hoặc nút{' '}
            <B>⇥</B> trên thanh bên phải), bấm vào ô to rồi Ctrl + V. Dán được nhiều câu một lúc; câu bị dính liền nhau trên một dòng
            (thường gặp khi copy từ PDF) máy vẫn tự tách.
          </li>
          <li>
            Nếu đáp án nằm riêng (ví dụ cuối sách), dán vào ô <B>Bảng đáp án</B> dạng "1A 2C 3B…". Chọn chỗ thêm vào (part có sẵn hoặc
            part mới) rồi bấm <B>Tách đề</B>.
          </li>
          <li>
            Máy tự tách question, lựa chọn, đáp án và đoạn văn đọc hiểu. Nếu web đã được cài AI, AI kiểm tra lại: gợi ý đáp án cho câu chưa
            có đáp án, báo đáp án có vẻ sai, báo question cần ảnh. Bấm vào một lựa chọn để đổi đáp án; bỏ tích <B>Question …</B> nếu không
            muốn đưa câu đó vào đề.
          </li>
          <li>Bấm <B>Áp dụng</B>. Các question thành thẻ như question bình thường, sửa tiếp được.</li>
        </ol>
        <Tip>
          Ảnh và audio <strong>không</strong> đi theo khi copy chữ. Question có thể cần ảnh và đáp án do AI gợi ý có dòng{' '}
          <B>Cần xem lại</B> trên thẻ. Bấm vào từng thẻ: thêm ảnh (hoặc bấm <B>Không cần ảnh</B>), kiểm tra đáp án rồi bấm{' '}
          <B>Xác nhận đáp án</B> (hoặc <B>Xác nhận tất cả</B> ở đầu trang soạn). Đề chưa xuất bản được tới khi xử lý hết các dòng này.
        </Tip>
        <Tip>Đề tự thiết kế chấm theo số câu đúng và điểm thang 10 (ví dụ 32/40 câu = 8 điểm), có số câu đúng từng phần.</Tip>
      </Section>

      <Section id="homework">
        <p>
          Web có 2 loại đề: <strong>Training Test</strong> (cho mọi người luyện tập, chỉ cần nhập họ tên) và{' '}
          <strong>Class Assignment</strong> (đề riêng của lớp: học sinh chọn lớp, bấm vào tên mình rồi làm).
        </p>
        <ol>
          <li>
            Vào <B>Đề thi</B> → <B>Tạo đề mới</B> → chọn <B>Class Assignment</B>, rồi chọn loại đề như bình thường (TOEIC, đề tự thiết kế
            hoặc khung mẫu).
          </li>
          <li>
            Ô <B>Tên đề</B>: chỉ cần gõ phần tên, ví dụ "Đề lớp 1A". Web tự thêm chữ <strong>Class Assignment -</strong> ở đầu. Mã đề web
            tự đặt (CA-001, CA-002…).
          </li>
          <li>
            <B>Giao cho lớp</B>: bấm chọn một hoặc nhiều lớp. <B>Mật khẩu đề</B>: không bắt buộc; nếu đặt, học sinh phải nhập đúng mới vào
            làm được (không phân biệt chữ hoa / thường). Đổi lớp hoặc mật khẩu sau ở tab <B>Thông tin đề</B> → mục "Giao cho lớp" → bấm{' '}
            <B>Lưu lớp và mật khẩu</B> (có hiệu lực ngay, không cần xuất bản lại).
          </li>
          <li>Soạn đề, thời gian, cách làm bài, xem trước và <B>Xuất bản</B> giống hệt Training Test.</li>
          <li>
            Học sinh: trang chủ → <B>Class Assignment</B> → chọn lớp → bấm vào <strong>tên mình</strong> → bấm <B>Làm bài</B>. Không cần
            gõ tên, web tự biết là ai.
          </li>
          <li>
            Xem ai đã làm: ở danh sách <B>Đề thi</B> bấm <B>Hoạt động</B> (hoặc mở đề → tab <B>Hoạt động</B>). Mỗi lớp được giao có đủ
            học sinh: <B>Đã làm</B> / <B>Chưa làm</B>, làm mấy lần, lúc nào, điểm mỗi lần; bấm vào từng lần để xem bài làm chi tiết.
            Giáo viên chỉ thấy (và chỉ giao đề cho) các lớp mình phụ trách. Bấm <B>Tải Excel</B> để tải bảng này về.
          </li>
          <li>
            Xem một học sinh: <B>Lớp học</B> → mở lớp → bấm vào <strong>tên học sinh</strong>: có điểm danh, điểm cộng và các bài
            đã làm.
          </li>
        </ol>
        <Tip>Các đề "Homework" tạo trước đây đã được chuyển thành Training Test (giữ nguyên tên).</Tip>
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
          <li>
            Vào <B>Kết quả</B>. Lọc theo tên (gõ có dấu hoặc không dấu đều được), số điện thoại, loại đề (Training Test / Class
            Assignment), giáo viên ra đề, đề, ngày. Học sinh làm bài của lớp hiện tên lớp thay cho số điện thoại.
          </li>
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
          <li>
            <B>Training Test</B>: học viên vào trang web → bấm <B>Training Test</B> → nhập họ và tên (không cần số điện thoại) →{' '}
            <B>Tiếp tục</B> → chọn đề → <B>Làm bài</B>.
          </li>
          <li>
            <B>Class Assignment</B>: bấm <B>Class Assignment</B> → chọn lớp → bấm vào tên mình → chọn bài của lớp → <B>Làm bài</B> (đề có
            mật khẩu thì nhập mật khẩu giáo viên cho).
          </li>
          <li>Đồng hồ bắt đầu chạy ngay. Hết giờ, bài <strong>tự nộp và tự chấm</strong>.</li>
          <li>Bài làm được tự động lưu. Lỡ tải lại trang hay mất mạng, mở lại vẫn còn bài.</li>
          <li>
            Đóng trình duyệt giữa chừng: Class Assignment thì bấm lại tên mình và bấm <B>Làm tiếp</B>; Training Test thì mở lại trên{' '}
            <strong>cùng máy</strong>, nhập đúng họ tên cũ và chọn đúng đề đó (thời gian vẫn tính tiếp).
          </li>
          <li>Ô <B>Cần xem lại</B> giúp học viên đánh dấu câu muốn xem lại. Bảng số câu: xanh = đã làm, trắng = chưa làm, viền cam = cần xem lại.</li>
          <li>Phần nghe: nếu đề không cho tua, học viên chỉ bấm được <B>Phát audio</B> / <B>Tạm dừng</B>.</li>
        </ol>
      </Section>

      <Section id="admin-chinh">
        {admin.role !== 'owner' && <p className="muted">Phần này dành cho admin chính. Bạn không thấy các mục này trong menu.</p>}
        <ul>
          <li>
            <B>Quản lý học phí</B>: học phí từng lớp theo tháng, thu tiền, lịch sử thu, tải Excel (xem mục 5).
          </li>
          <li>
            <B>Tài khoản admin</B>: tạo tài khoản cho giáo viên (tên hiển thị, tên đăng nhập, mật khẩu), <B>Vô hiệu hóa</B> /{' '}
            <B>Mở lại</B> tài khoản, <B>Đặt lại mật khẩu</B> khi có người quên.
          </li>
          <li>
            <B>Lịch sử chỉnh sửa</B>: ai đã tạo đề, sửa đề, xuất bản, thêm / sửa / cho nghỉ học sinh, xếp lịch, điểm danh, sửa điểm danh,
            thu học phí… lúc nào. Lọc theo <B>Lớp học</B> để xem riêng một lớp (hoặc vào lớp → tab <B>Lịch sử thay đổi</B>).
          </li>
          <li>
            Trang chính có thêm khung <B>Hôm nay ở trung tâm</B> (mọi buổi học hôm nay) và <B>Buổi chưa điểm danh</B> của mọi giáo viên.
            Admin chính sửa được điểm danh mọi buổi, không giới hạn thời gian.
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
          <dt>Học sinh không thấy bài của lớp?</dt>
          <dd>Kiểm tra đề đã <B>Xuất bản</B> chưa và đã chọn lớp ở tab <B>Thông tin đề</B> → "Giao cho lớp" chưa.</dd>
          <dt>Học sinh không thấy tên mình trong lớp?</dt>
          <dd>Thêm học sinh vào lớp ở <B>Lớp học</B> → tab <B>Học sinh</B>. Học sinh đã "Cho nghỉ" sẽ không hiện.</dd>
          <dt>Nút "Bắt đầu buổi học" bị mờ?</dt>
          <dd>Chưa tới 30 phút trước giờ học. Đợi tới giờ, nút tự sáng lên (không cần tải lại trang).</dd>
          <dt>Không bấm mở được một buổi học trên thời khóa biểu?</dt>
          <dd>Đó là buổi của giáo viên khác. Bạn chỉ mở được buổi mình dạy. Nếu đúng là buổi của bạn, nhờ admin chính sửa lại giáo viên.</dd>
          <dt>Học sinh mới không có trong danh sách điểm danh?</dt>
          <dd>Kiểm tra <B>Ngày vào học</B> của bạn đó (tab Học sinh → <B>Sửa</B>): phải là ngày của buổi học hoặc trước đó.</dd>
          <dt>Nhập Excel báo "File .xls (Excel đời cũ) chưa đọc được"?</dt>
          <dd>Mở file bằng Excel → <B>Lưu thành</B> (Save As) → chọn "Excel Workbook (.xlsx)" rồi chọn lại file mới.</dd>
          <dt>Nhập Excel báo chưa có cột "Họ và tên"?</dt>
          <dd>Ở mục "1. Kiểm tra các cột", tìm cột chứa tên học sinh và chọn <B>Họ và tên</B> ở ô bên phải.</dd>
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
