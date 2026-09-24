package iam

import (
	"errors"
	"unicode"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

func ValidateComplexity(password string) error {
	if utf8.RuneCountInString(password) < 8 {
		return errors.New("密码至少需要 8 个字符")
	}

	var hasUpper, hasLower, hasDigit, hasSpecial bool
	for _, r := range password {
		hasUpper = hasUpper || unicode.IsUpper(r)
		hasLower = hasLower || unicode.IsLower(r)
		hasDigit = hasDigit || unicode.IsDigit(r)
		hasSpecial = hasSpecial || unicode.IsPunct(r) || unicode.IsSymbol(r)
	}
	if !hasUpper {
		return errors.New("密码必须包含大写字母")
	}
	if !hasLower {
		return errors.New("密码必须包含小写字母")
	}
	if !hasDigit {
		return errors.New("密码必须包含数字")
	}
	if !hasSpecial {
		return errors.New("密码必须包含特殊字符")
	}
	return nil
}

// HashPassword returns a bcrypt hash at the default cost. Same function Global
// uses, so hashes are interchangeable.
func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// VerifyPassword reports whether password matches the bcrypt hash.
func VerifyPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
