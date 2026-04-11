import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { TripHome } from './TripHome';
import { TemplatesList } from './TemplatesList';
import { TemplateDetail } from './TemplateDetail';
import { NewTripFromTemplate } from './NewTripFromTemplate';
import { ItemLibrary } from './ItemLibrary';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <header className="topbar">
          <Link to="/" className="brand">Hiking Gear</Link>
          <nav className="topnav">
            <Link to="/templates">Templates</Link>
            <Link to="/items">Items</Link>
          </nav>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<TripHome />} />
            <Route path="/templates" element={<TemplatesList />} />
            <Route path="/templates/:slug" element={<TemplateDetail />} />
            <Route path="/new-trip/:slug" element={<NewTripFromTemplate />} />
            <Route path="/items" element={<ItemLibrary />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
