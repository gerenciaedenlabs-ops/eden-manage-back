export const formatDate = (date = new Date()) =>
    date.toISOString().split("T")[0];

export const randomString = (length = 10) =>
    Math.random().toString(36).substring(2, 2 + length);
