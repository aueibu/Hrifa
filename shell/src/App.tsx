import '@mantine/core/styles.css';

import { Router } from './Router';
import { AppThemeProvider } from './theme/ThemeProvider';

export default function App() {
  return (
    <AppThemeProvider>
      <Router />
    </AppThemeProvider>
  );
}
