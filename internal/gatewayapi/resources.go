package gatewayapi

import (
	"crypto/sha256"
	"encoding/hex"

	"k8s.io/apimachinery/pkg/runtime/schema"
)

const Group = "gateway.modelsphere.io"
const Version = "v1alpha1"

var (
	APIKeys          = schema.GroupVersionResource{Group: Group, Version: Version, Resource: "apikeys"}
	PriceRules       = schema.GroupVersionResource{Group: Group, Version: Version, Resource: "pricerules"}
	WalletAdmissions = schema.GroupVersionResource{Group: Group, Version: Version, Resource: "walletadmissions"}
)

func WalletName(ownerUID string) string {
	digest := sha256.Sum256([]byte(ownerUID))
	return "wallet-" + hex.EncodeToString(digest[:20])
}
