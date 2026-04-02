export const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length >= 5;
}

export const validatePhone = (phone: string): boolean => {
    const phoneRegex = /^\d{10,15}$/;
    const cleanPhone = phone.replace(/\D/g, '');
    return phoneRegex.test(cleanPhone)
}

export const validateOTP = (code: string): boolean => {
    const otpRegex = /^\d{6}$/;
    return otpRegex.test(code);
  };