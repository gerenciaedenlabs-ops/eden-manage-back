import bcrypt from 'bcrypt'

export async function hashPassword(password) {
    return await bcrypt.hash(password, 10)
}

export async function verifyPassword(myPassword, hash) {
    const isMatch = await bcrypt.compare(myPassword, hash)
    return isMatch
}