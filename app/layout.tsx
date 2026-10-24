import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'down? — less “we should.” more “we did.”',description:'Find the plans hiding in your friend group. Private interests. A workable crew. One mutual reveal.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
