import React from 'react';
import '../styles/Header.css';

const Header = () => {
  return (
    <header className="app-header">
      <h1 className="app-title">SafePath</h1>
      <p className="app-description">
        Plan your journey and discover places along the way using natural language.
      </p>
    </header>
  );
};

export default Header;
