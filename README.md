# Web Bluetooth Setup (TypeScript + Linux)

## 1. Add Web Bluetooth Type Definitions

บางครั้งการติดตั้งแพ็กเกจอย่างเดียวอาจยังไม่เพียงพอ จำเป็นต้องแจ้งให้ TypeScript โหลด type definitions ของ Web Bluetooth เพิ่มเติมด้วย

เปิดไฟล์ `tsconfig.json` (ที่อยู่ใน root ของโปรเจกต์) แล้วเพิ่ม `"types": ["web-bluetooth"]` ภายใน `compilerOptions`

```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    },

    // 👇 เพิ่มบรรทัดนี้เข้าไป 👇
    "types": ["web-bluetooth"]
    
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

---

## 2. Enable Web Bluetooth on Linux (Chrome Flags)

บน Linux บางครั้งฟีเจอร์ Web Bluetooth ยังถูกปิดไว้โดยค่าเริ่มต้น จำเป็นต้องเปิดผ่าน Chrome Flags

### Step 1: Enable Experimental Web Platform Features

เปิด URL ต่อไปนี้ใน Chrome:

```text
chrome://flags/#enable-experimental-web-platform-features
```

เปลี่ยนค่า:

```text
Experimental Web Platform features
Default/Disabled → Enabled
```

### Step 2: Enable Web Bluetooth

ค้นหาคำว่า **Web Bluetooth** ในหน้า `chrome://flags`

หรือเปิดโดยตรง:

```text
chrome://flags/#enable-web-bluetooth
```

แล้วตั้งค่าเป็น:

```text
Enabled
```

### Step 3: Restart Chrome

กดปุ่ม **Relaunch** ที่มุมขวาล่างเพื่อรีสตาร์ทเบราว์เซอร์

---

## 3. iPhone / iPad Users

Safari บน iOS/iPadOS ยังไม่รองรับ Web Bluetooth API โดยตรง ดังนั้นหากใช้งานบน iPhone หรือ iPad แนะนำให้ใช้เบราว์เซอร์
:contentReference[oaicite:0]{index=0}
ซึ่งรองรับ Web Bluetooth และสามารถใช้งานกับอุปกรณ์ BLE ได้

**วิธีใช้งาน**

1. ติดตั้งแอป Bluefy จาก App Store
2. เปิดเว็บไซต์ของโปรเจกต์ผ่านแอป Bluefy
3. กดปุ่ม **Connect**
4. เลือกอุปกรณ์ BLE ที่ต้องการเชื่อมต่อ

---

## 4. Test the Application

หลังจากตั้งค่าเรียบร้อยแล้ว:

1. เปิดหน้า

```text
http://localhost:5500/ble.html
```

2. กดปุ่ม **Connect**

หากตั้งค่าถูกต้อง หน้าต่างสำหรับสแกนอุปกรณ์ BLE ควรปรากฏขึ้น และสามารถเชื่อมต่ออุปกรณ์ได้ตามปกติ ✅