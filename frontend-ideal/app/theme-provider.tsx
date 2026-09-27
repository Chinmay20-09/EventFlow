'use client';
import {ThemeProvider} from 'next-themes';
export default function AppThemeProvider({children}:{children:React.ReactNode}){
 return <ThemeProvider attribute="class" storageKey="eventflow-theme" defaultTheme="light" enableSystem={false} disableTransitionOnChange>{children}</ThemeProvider>;
}
