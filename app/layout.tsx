import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"BGI Quiz Night | PT Bringin Gigantara",description:"Arena kuis 36 Tahun BGI. Bersama, Melangkah Lebih Kuat. Satu Tujuan, Satu Tim untuk Indonesia.",robots:{index:false,follow:false},icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="id"><head><link rel="stylesheet" href="/styles/bgi-quiz.css?v=20261109-question-image-side-layout"/><link rel="stylesheet" href="/styles/arena-reference.css?v=20261109-question-layout-precise"/></head><body>{children}</body></html>;}
