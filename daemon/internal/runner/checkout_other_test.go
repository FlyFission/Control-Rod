//go:build !unix

package runner

import "testing"

func TestNoCheckoutSupportWithoutCustody(t *testing.T) {
	if checkoutCustodySupported() {
		t.Fatal("custody is unavailable here, so checkouts must not be advertised")
	}
	if _, err := lockCheckout("lock"); err == nil {
		t.Fatal("lockCheckout must fail where custody is unavailable")
	}
}
