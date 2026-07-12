/**
 * Mock for @theme/Layout
 */
const React = require('react');

module.exports = function Layout({ children }) {
  return React.createElement('div', { 'data-testid': 'layout' }, children);
};
