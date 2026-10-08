import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Đọc HOST và PORT trong file .env ở thư mục gốc dự án (chỉ 2 biến này).
 * Không dùng loadEnv của Vite: hàm đó thấy NODE_ENV=development trong .env sẽ build giao diện
 * bằng bản React dành cho lập trình (nặng gấp rưỡi, chậm hơn) kể cả khi chạy "npm run build".
 */
function readBackendAddress() {
  const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  const values = {};
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(HOST|PORT)\s*=\s*['"]?([^'"#\s]*)/);
      if (m) values[m[1]] = m[2];
    }
  }
  return {
    host: process.env.HOST || values.HOST || '127.0.0.1',
    port: process.env.PORT || values.PORT || '3000',
  };
}

export default defineConfig(({ command }) => {
  // Backend chạy ở host/cổng nào. Lưu ý: sửa .env thì phải tắt và chạy lại "npm run dev".
  const { host, port } = readBackendAddress();
  const target = `http://${host}:${port}`;

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
