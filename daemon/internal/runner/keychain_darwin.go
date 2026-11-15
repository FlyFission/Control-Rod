//go:build darwin && cgo

package runner

/*
#cgo LDFLAGS: -framework Security -framework CoreFoundation
#include <stdlib.h>
#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>

static OSStatus crSecCopy(CFStringRef service, CFStringRef account, CFDataRef *out) {
	const void *keys[] = { kSecClass, kSecAttrService, kSecAttrAccount, kSecReturnData };
	const void *vals[] = { kSecClassGenericPassword, service, account, kCFBooleanTrue };
	CFDictionaryRef query = CFDictionaryCreate(NULL, keys, vals, 4, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
	OSStatus st = SecItemCopyMatching(query, (CFTypeRef *)out);
	CFRelease(query);
	return st;
}

static OSStatus crSecAdd(CFStringRef service, CFStringRef account, CFDataRef secret) {
	const void *keys[] = { kSecClass, kSecAttrService, kSecAttrAccount, kSecValueData };
	const void *vals[] = { kSecClassGenericPassword, service, account, secret };
	CFDictionaryRef item = CFDictionaryCreate(NULL, keys, vals, 4, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
	OSStatus st = SecItemAdd(item, NULL);
	CFRelease(item);
	return st;
}
*/
import "C"
import (
	"crypto/ed25519"
	"unsafe"
)

func cfString(s string) C.CFStringRef {
	cs := C.CString(s)
	defer C.free(unsafe.Pointer(cs))
	return C.CFStringCreateWithCString(C.kCFAllocatorDefault, cs, C.kCFStringEncodingUTF8)
}

func lookupOSKey() (ed25519.PrivateKey, error) {
	service := cfString("controlrod-daemon-signing")
	account := cfString("controlrod")
	defer C.CFRelease(C.CFTypeRef(service))
	defer C.CFRelease(C.CFTypeRef(account))
	var data C.CFDataRef
	st := C.crSecCopy(service, account, &data)
	if st == C.errSecItemNotFound {
		return nil, errKeyNotFound
	}
	if st != C.errSecSuccess || data == 0 {
		return nil, errKeychainUnavailable
	}
	defer C.CFRelease(C.CFTypeRef(data))
	raw := C.GoBytes(unsafe.Pointer(C.CFDataGetBytePtr(data)), C.int(C.CFDataGetLength(data)))
	return parseStoredKey(raw)
}

func storeOSKey(k ed25519.PrivateKey) error {
	secret := encodeStoredKey(k)
	service := cfString("controlrod-daemon-signing")
	account := cfString("controlrod")
	defer C.CFRelease(C.CFTypeRef(service))
	defer C.CFRelease(C.CFTypeRef(account))
	data := C.CFDataCreate(C.kCFAllocatorDefault, (*C.UInt8)(unsafe.Pointer(&secret[0])), C.CFIndex(len(secret)))
	defer C.CFRelease(C.CFTypeRef(data))
	st := C.crSecAdd(service, account, data)
	if st == C.errSecDuplicateItem {
		return errKeychainUnavailable
	}
	if st != C.errSecSuccess {
		return errKeychainUnavailable
	}
	return nil
}
