import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import './index.css';
createRoot(document.getElementById('root')!, {
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} forcedTheme="dark">
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </ThemeProvider>,
);

