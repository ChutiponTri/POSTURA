import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      {/* โลโก้แอปที่อยู่เหนือการ์ด */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-[#655DDD] tracking-wide">POSTURA</h1>
        <p className="text-sm text-slate-500 font-medium mt-1">Welcome back to better health</p>
      </div>

      <SignIn 
        appearance={{
          elements: {
            // ปรับแต่งการ์ดหลัก
            card: "bg-white shadow-xl border border-slate-100 rounded-3xl pb-8 w-full max-w-sm",
            
            // ปรับแต่งส่วน Header (ซ่อนชื่อแอปของ Clerk เพราะเราทำเองไว้ด้านบนแล้ว)
            headerTitle: "hidden",
            headerSubtitle: "text-slate-500 text-sm text-center",
            
            // ปรับแต่งปุ่ม Social Login
            socialButtonsBlockButton: "border border-slate-200 rounded-xl py-3 hover:bg-slate-50 transition-colors",
            socialButtonsBlockButtonText: "font-semibold text-slate-600",
            
            // ปรับแต่งปุ่มหลัก (ปุ่มสีม่วงของเรา)
            formButtonPrimary: "bg-[#655DDD] hover:bg-[#4a44a6] text-white py-3 rounded-xl font-bold transition-colors shadow-md",
            
            // ปรับแต่งช่อง Input
            formFieldInput: "rounded-xl border-slate-200 focus:ring-[#655DDD] focus:border-[#655DDD] py-2.5",
            formFieldLabel: "text-slate-700 font-medium",
            
            // ปรับแต่งข้อความแจ้งเตือน / Error
            formFieldErrorText: "text-red-500 text-xs",
            
            // ปรับแต่งลิงก์ด้านล่าง (ลืมรหัสผ่าน / ไปหน้า Sign up)
            footerActionLink: "text-[#655DDD] hover:text-[#4a44a6] font-bold",
          }
        }}
        // กำหนดให้เมื่อ Login เสร็จ ให้เด้งกลับไปที่หน้า Dashboard หลักของเรา
        forceRedirectUrl="/"
        signUpUrl="/sign-up"
      />
    </div>
  );
}