import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-[#655DDD] tracking-wide">POSTURA</h1>
        <p className="text-sm text-slate-500 font-medium mt-1">Start your journey to better posture</p>
      </div>

      <SignUp 
        appearance={{
          elements: {
            card: "bg-white shadow-xl border border-slate-100 rounded-3xl pb-8 w-full max-w-sm",
            headerTitle: "hidden",
            headerSubtitle: "text-slate-500 text-sm text-center",
            socialButtonsBlockButton: "border border-slate-200 rounded-xl py-3 hover:bg-slate-50 transition-colors",
            socialButtonsBlockButtonText: "font-semibold text-slate-600",
            formButtonPrimary: "bg-[#655DDD] hover:bg-[#4a44a6] text-white py-3 rounded-xl font-bold transition-colors shadow-md",
            formFieldInput: "rounded-xl border-slate-200 focus:ring-[#655DDD] focus:border-[#655DDD] py-2.5",
            formFieldLabel: "text-slate-700 font-medium",
            footerActionLink: "text-[#655DDD] hover:text-[#4a44a6] font-bold",
          }
        }}
        forceRedirectUrl="/"
        signInUrl="/sign-in"
      />
    </div>
  );
}