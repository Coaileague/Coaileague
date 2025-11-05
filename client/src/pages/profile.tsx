import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Profile() {
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    setLocation("/employee/profile");
  }, [setLocation]);
  
  return null;
}
