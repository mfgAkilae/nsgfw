# T10 case 4: the azurerm association on a dual-stack network interface that t10.py created.
# Credentials and IDs come from environment variables (ARM_*, TF_VAR_*), set by t10.py.
terraform {
  required_version = ">= 1.7"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "= 5.13.0"
    }
  }
}

provider "azurerm" {
  features {}
  resource_provider_registrations = "none"
}

variable "network_interface_id" { type = string }
variable "application_security_group_id" { type = string }

resource "azurerm_network_interface_application_security_group_association" "member" {
  network_interface_id          = var.network_interface_id
  application_security_group_id = var.application_security_group_id
}
