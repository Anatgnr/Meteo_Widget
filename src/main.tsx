import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './styles.css';
import './widget.css';

createRoot(document.getElementById('root')!).render(<App/>);
