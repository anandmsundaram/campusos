import Link from 'next/link'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#060b17] text-white font-sans antialiased">
      {/* Nav */}
      <header className="border-b border-[#1e2d4a]/60 bg-[#060b17]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-blue-400 text-lg leading-none">⬡</span>
            <span className="font-semibold text-[15px] tracking-tight text-white">CampusOS</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/terms"    className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Terms</Link>
            <Link href="/privacy"  className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Privacy</Link>
            <Link href="/guidelines" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Guidelines</Link>
            <Link href="/safety"   className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Safety</Link>
            <Link href="/support"  className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Support</Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-5 py-14 pb-24">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1e2d4a] bg-[#060b17]">
        <div className="mx-auto max-w-4xl px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-blue-400 leading-none">⬡</span>
            <span className="text-sm font-medium text-slate-500">CampusOS</span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-xs text-slate-600">
            <Link href="/terms"      className="hover:text-slate-400 transition-colors">Terms of Service</Link>
            <Link href="/privacy"    className="hover:text-slate-400 transition-colors">Privacy Policy</Link>
            <Link href="/guidelines" className="hover:text-slate-400 transition-colors">Community Guidelines</Link>
            <Link href="/safety"     className="hover:text-slate-400 transition-colors">Safety</Link>
            <Link href="/support"    className="hover:text-slate-400 transition-colors">Support</Link>
            <a href="mailto:campusosapp@gmail.com" className="hover:text-slate-400 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
