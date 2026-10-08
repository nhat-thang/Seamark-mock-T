// Test hàm chia file thành từng đợt khi tải lên (file của frontend): mỗi đợt <= 90 MB và <= 10 file,
// để không vượt giới hạn 100 MB mỗi request của Cloudflare.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'api.js')).href);
const MB = 1024 * 1024;
const file = (name, mb) => ({ name, size: mb * MB });
const names = (batches) => batches.map((b) => b.map((f) => f.name));

test('Chia đợt theo dung lượng: 5 audio 30 MB -> 3 + 2 file', async () => {
  const { uploadBatches } = await load();
  const files = ['a', 'b', 'c', 'd', 'e'].map((n) => file(n, 30));
  assert.deepEqual(names(uploadBatches(files)), [['a', 'b', 'c'], ['d', 'e']]);
});

test('Chia đợt theo số file: 25 ảnh nhỏ -> 10 + 10 + 5', async () => {
  const { uploadBatches } = await load();
  const files = Array.from({ length: 25 }, (_, i) => file(`img${i}`, 0.2));
  assert.deepEqual(uploadBatches(files).map((b) => b.length), [10, 10, 5]);
});

test('File lớn hơn 90 MB đi một mình; danh sách rỗng -> không có đợt nào', async () => {
  const { uploadBatches } = await load();
  const files = [file('nho', 5), file('to', 94), file('nho2', 5)];
  assert.deepEqual(names(uploadBatches(files)), [['nho'], ['to'], ['nho2']]);
  assert.deepEqual(uploadBatches([]), []);
});
