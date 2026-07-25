import React from "react";
import { Navigate } from "react-router-dom";
export const Register = () => {
  // Redirection to standard login which manages authentication popups
  return <Navigate to="/login" replace />;
};
