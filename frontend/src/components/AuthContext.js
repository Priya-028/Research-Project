import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const login = (_id, email, userType) => {
    const userData = { _id, email, userType }; //  user data
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    console.log('Logged in:', userData);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    console.log('Logged out');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
