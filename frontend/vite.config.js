import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode, command }) => {
  // Đọc file .env ở thư mục gốc dự án để biết backend chạy ở host/cổng nào.
  // Lưu ý: sửa .env thì phải tắt và chạy lại "npm run dev".
  const env = loadEnv(mode, '..', '');
  const backendHost = env.HOST || '127.0.0.1';
  const backendPort = env.PORT || '3000';
  const target = `http://${backendHost}:${backendPort}`;

  if (command === 'serve') {
    console.log(`Các yêu cầu /api sẽ được chuyển tới backend ở ${target}`);
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Cổng 5173 bị chiếm (thường do lần chạy trước chưa tắt hẳn) thì báo lỗi, không tự đổi sang cổng khác
      strictPort: true,
      // Khi chạy dev: mọi request /api được chuyển tiếp sang backend
      proxy: {
        '/api': target,
      },
    },
  };
});
