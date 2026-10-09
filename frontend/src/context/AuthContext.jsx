import { createContext, useState, useEffect } from 'react';
import axios from 'axios';

axios.defaults.withCredentials = true;

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // If token expired, clear local storage and redirect to login
      localStorage.removeItem('hvac_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // For simplicity we check if there's user in local storage to prevent flicker
    const savedUser = localStorage.getItem('hvac_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await axios.post('http://localhost:5000/api/auth/login', { email, password });
    setUser(res.data.user);
    localStorage.setItem('hvac_user', JSON.stringify(res.data.user));
    return res.data;
  };

  const register = async (username, email, password) => {
    const res = await axios.post('http://localhost:5000/api/auth/register', { username, email, password });
    setUser(res.data.user);
    localStorage.setItem('hvac_user', JSON.stringify(res.data.user));
    return res.data;
  };

  const logout = async () => {
    await axios.post('http://localhost:5000/api/auth/logout');
    setUser(null);
    localStorage.removeItem('hvac_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
