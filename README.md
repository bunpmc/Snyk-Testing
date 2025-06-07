# Hướng dẫn cài đặt và triển khai dự án Supabase

## Cài đặt thư viện nvm và npx

1. Cài đặt Node.js phiên bản 20:

```
nvm install 20
nvm use 20
```

## Cài đặt Deno

1. Trong VSCode, cài đặt extension Deno:
   - Mở VSCode → Extensions → Tìm và cài đặt "Deno".
2. Khởi tạo không gian làm việc cho Deno:
   - Mở thanh tìm kiếm trong VSCode (Ctrl+Shift+P) → Gõ ">Deno Initialize Workspace" → Enter.

## Cài đặt Supabase CLI trên Windows

1. Tải scoop cho Windows: `https://scoop.sh/`
2. Kiểm tra phiên bản trong Powershell (chạy thường) :

```
scoop --version
```

3. Tải supabase CLI

```
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

4. Update supabase CLI (optional)

```
scoop update supabase
```

5. Kiểm tra supabase CLI version trong Powershell terminal của Visual Studio Code

```
supabase --version
```

## Khởi chạy dự án đầu tiên

1. Khởi tạo dự án Supabase:

```
supabase init
```

2. Khởi động Supabase:

```
supabase start
```

- Kiểm tra trong Docker Desktop, tìm container có tên trùng với thư mục dự án hoặc dạng `supabase_db_[tên-thư-mục]`. Nếu trạng thái hiển thị màu xanh, container đang chạy đúng.

3. Dừng Supabase:

```
npx supabase stop
```

4. Đẩy database lên Supabase web lần đầu:

```
npx supabase db push
```

5. Lấy database từ Supabase web về local:

```
npx supabase db pull
```

6. Đặt lại database theo file migration:

```
npx supabase db reset
```

7. Tạo edge function:

```
npx supabase functions new [tên-function]
```

8. Tạo migration mới:

```
npx supabase migrations new [tên-migration]
```

## Liên kết dự án local với dự án Supabase trên web

Dự án local ban đầu chỉ chạy trên `http://127.0.0.1:54321`. Để liên kết với dự án chính trên Supabase:

1. Đăng nhập Supabase:

```
npx supabase login
```

- Trình duyệt sẽ mở, tự động yêu cầu nhập code xác thực.

2. Liên kết dự án:

```
npx supabase link --project-ref [project-link]
```

- Lấy `[project-link]` từ URL: `https://supabase.com/dashboard/project/[project-link]`.
- Nhập mật khẩu dự án (mặc định: `12345` khi tạo dự án).

## Triển khai edge function lên Supabase web

```
npx supabase functions deploy [tên-function]
```

## Xử lý lỗi thường gặp

### Lỗi container Supabase*db*[tên] không hoạt động (unhealthy)

**Nguyên nhân**:

- Xung đột schema database.
- Xung đột trong file migration.

**Cách khắc phục**:

1. Tạo dự án mới trên Supabase web.
2. Xóa thư mục Supabase local:

```
rm -rf supabase
```

3. Quay lại bước "Khởi chạy dự án đầu tiên" và kiểm tra schema database (tránh viết sai dẫn đến xung đột).

### Lỗi Docker: Supabase exited hoặc unhealthy (hot standby)

**Cách khắc phục**:

1. Mở Docker Desktop → Settings → General.
2. Bật tùy chọn: `Expose daemon on tcp://localhost:2375 without TLS`.
3. Khởi động lại dự án.
