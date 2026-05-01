import { useState } from "react";
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription, UniversalModalFooter } from "@/components/ui/universal-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Shield, Upload, Camera, FileText, Lock } from "lucide-react";

interface SecureRequestDialogProps {
  open: boolean;
  onClose: () => void;
  requestType: 'authenticate' | 'document' | 'photo' | 'signature' | 'info';
  requestedBy: string;
  requestMessage?: string;
  onSubmit: (data) => void;
}

export function SecureRequestDialog({
  open,
  onClose,
  requestType,
  requestedBy,
  requestMessage,
  onSubmit,
}: SecureRequestDialogProps) {
  const [formData, setFormData] = useState<any>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleSubmit = () => {
    onSubmit({
      ...formData,
      file: selectedFile,
      timestamp: new Date().toISOString(),
    });
    onClose();
  };

  const getDialogContent = () => {
    switch (requestType) {
      case 'authenticate':
        return (
          <>
            <UniversalModalHeader>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-blue-600" />
                <UniversalModalTitle>Authentication Request</UniversalModalTitle>
              </div>
              <UniversalModalDescription>
                {requestedBy} is requesting verification of your identity. Please provide the requested information securely.
              </UniversalModalDescription>
            </UniversalModalHeader>
            <div className="space-y-4 py-4">
              {requestMessage && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <p className="font-semibold text-blue-900">Request:</p>
                  <p className="text-blue-700">{requestMessage}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  data-testid="input-auth-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-id">Account ID or Username</Label>
                <Input
                  id="account-id"
                  placeholder="Enter your account ID"
                  onChange={(e) => setFormData({...formData, accountId: e.target.value})}
                  data-testid="input-auth-account"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="verification">Additional Verification</Label>
                <Textarea
                  id="verification"
                  placeholder="Last 4 digits of phone, order number, etc."
                  onChange={(e) => setFormData({...formData, verification: e.target.value})}
                  data-testid="input-auth-verification"
                />
              </div>
            </div>
          </>
        );

      case 'document':
        return (
          <>
            <UniversalModalHeader>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <UniversalModalTitle>Document Upload Request</UniversalModalTitle>
              </div>
              <UniversalModalDescription>
                {requestedBy} is requesting you upload a document. Your file will be securely transmitted.
              </UniversalModalDescription>
            </UniversalModalHeader>
            <div className="space-y-4 py-4">
              {requestMessage && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <p className="font-semibold text-blue-900">Requested Document:</p>
                  <p className="text-blue-700">{requestMessage}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="document">Select Document</Label>
                <Input
                  id="document"
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  data-testid="input-document-file"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Add any additional context..."
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  data-testid="input-document-notes"
                />
              </div>
            </div>
          </>
        );

      case 'photo':
        return (
          <>
            <UniversalModalHeader>
              <div className="flex items-center gap-2 mb-2">
                <Camera className="w-5 h-5 text-blue-600" />
                <UniversalModalTitle>Photo Upload Request</UniversalModalTitle>
              </div>
              <UniversalModalDescription>
                {requestedBy} is requesting you upload a photo. This will help resolve your issue faster.
              </UniversalModalDescription>
            </UniversalModalHeader>
            <div className="space-y-4 py-4">
              {requestMessage && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <p className="font-semibold text-blue-900">Photo Request:</p>
                  <p className="text-blue-700">{requestMessage}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="photo">Select Photo</Label>
                <Input
                  id="photo"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  data-testid="input-photo-file"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what's in the photo..."
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  data-testid="input-photo-description"
                />
              </div>
            </div>
          </>
        );

      case 'signature':
        return (
          <>
            <UniversalModalHeader>
              <div className="flex items-center gap-2 mb-2">
                <Upload className="w-5 h-5 text-blue-600" />
                <UniversalModalTitle>E-Signature Request</UniversalModalTitle>
              </div>
              <UniversalModalDescription>
                {requestedBy} is requesting your electronic signature to proceed.
              </UniversalModalDescription>
            </UniversalModalHeader>
            <div className="space-y-4 py-4">
              {requestMessage && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <p className="font-semibold text-blue-900">Document to Sign:</p>
                  <p className="text-blue-700">{requestMessage}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="full-name">Full Legal Name</Label>
                <Input
                  id="full-name"
                  placeholder="Enter your full name"
                  onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                  data-testid="input-signature-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agree">Agreement</Label>
                <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <input
                    type="checkbox"
                    id="agree"
                    className="mt-1"
                    onChange={(e) => setFormData({...formData, agreed: e.target.checked})}
                    data-testid="checkbox-signature-agree"
                  />
                  <label htmlFor="agree" className="text-sm text-slate-700">
                    I confirm that I am signing this electronically and understand this constitutes a legal signature.
                  </label>
                </div>
              </div>
            </div>
          </>
        );

      case 'info':
        return (
          <>
            <UniversalModalHeader>
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-5 h-5 text-blue-600" />
                <UniversalModalTitle>Information Request</UniversalModalTitle>
              </div>
              <UniversalModalDescription>
                {requestedBy} needs some information from you to assist with your request.
              </UniversalModalDescription>
            </UniversalModalHeader>
            <div className="space-y-4 py-4">
              {requestMessage && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <p className="font-semibold text-blue-900">Question:</p>
                  <p className="text-blue-700">{requestMessage}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="response">Your Response</Label>
                <Textarea
                  id="response"
                  placeholder="Enter your response here..."
                  rows={5}
                  onChange={(e) => setFormData({...formData, response: e.target.value})}
                  data-testid="input-info-response"
                />
              </div>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <UniversalModal open={open} onOpenChange={(v) => { if(!v) onClose(); }} size="md" className="max-h-[calc(100vh-2rem)] overflow-y-auto">
        {getDialogContent()}
        <UniversalModalFooter>
          <div className="flex items-center justify-between gap-2 w-full">
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Shield className="w-3 h-3" />
              <span>Secure & Encrypted</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onClose}
                data-testid="button-cancel-request"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-submit-request"
              >
                Submit Securely
              </Button>
            </div>
          </div>
        </UniversalModalFooter>
    </UniversalModal>
  );
}
