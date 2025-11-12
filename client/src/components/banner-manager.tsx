/**
 * Banner Manager - Create and manage announcement banners with holiday templates
 * Staff-only tool for creating engaging banners with graphics and animations
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertCircle, Clock, Users, Zap, TrendingUp, Award, Bell, 
  MessageCircle, Star, Heart, Gift, Sparkles, PartyPopper,
  Snowflake, Ghost, TreePine, Cake, Flag, Sparkle,
  Calendar, Plus, Trash2, Copy, Eye, Edit
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface BannerMessage {
  id: string;
  text: string;
  type: 'info' | 'warning' | 'success' | 'promo' | 'queue';
  link?: string;
  icon?: string;
  emoticon?: string;
  imageUrl?: string;
  sparkleEffect?: boolean;
  enabled?: boolean;
}

interface HolidayTemplate {
  id: string;
  name: string;
  season: string;
  icon: any;
  defaultText: string;
  type: 'promo' | 'info' | 'success';
  bannerIcon: string;
  effect: 'snow' | 'fireworks' | 'hearts' | 'halloween' | 'none';
  gradient: string;
}

const HOLIDAY_TEMPLATES: HolidayTemplate[] = [
  {
    id: 'new-year',
    name: 'New Year Celebration',
    season: 'January 1-7',
    icon: PartyPopper,
    defaultText: 'Happy New Year! Start 2024 with 50% off all Elite plans!',
    type: 'promo',
    bannerIcon: 'zap',
    effect: 'fireworks',
    gradient: 'from-purple-600 to-blue-700'
  },
  {
    id: 'valentines',
    name: "Valentine's Day",
    season: 'February 10-20',
    icon: Heart,
    defaultText: "Show your team some love - Valentine's Special: 25% off all plans!",
    type: 'promo',
    bannerIcon: 'heart',
    effect: 'hearts',
    gradient: 'from-pink-600 to-blue-700'
  },
  {
    id: 'spring-sale',
    name: 'Spring Sale',
    season: 'March 15-31',
    icon: Sparkles,
    defaultText: 'Spring into savings! Fresh new features and 30% off all subscriptions!',
    type: 'promo',
    bannerIcon: 'star',
    effect: 'none',
    gradient: 'from-blue-600 to-accent'
  },
  {
    id: 'independence',
    name: 'Independence Day',
    season: 'July 1-7',
    icon: Flag,
    defaultText: 'Celebrate Independence Day with freedom from manual HR! 40% off Elite plans!',
    type: 'promo',
    bannerIcon: 'zap',
    effect: 'fireworks',
    gradient: 'from-red-600 to-blue-700'
  },
  {
    id: 'back-to-school',
    name: 'Back to School',
    season: 'August 15-31',
    icon: Calendar,
    defaultText: 'Back to School special: Streamline your workforce management - 35% off!',
    type: 'info',
    bannerIcon: 'trending',
    effect: 'none',
    gradient: 'from-orange-600 to-blue-700'
  },
  {
    id: 'halloween',
    name: 'Halloween',
    season: 'October 25-31',
    icon: Ghost,
    defaultText: "Spooky good deals! Don't be scared of HR tasks - automate them! 40% off!",
    type: 'promo',
    bannerIcon: 'zap',
    effect: 'halloween',
    gradient: 'from-orange-600 to-purple-700'
  },
  {
    id: 'thanksgiving',
    name: 'Thanksgiving',
    season: 'November 20-28',
    icon: Gift,
    defaultText: "We're thankful for you! Special Thanksgiving offer: 30% off all plans!",
    type: 'success',
    bannerIcon: 'award',
    effect: 'none',
    gradient: 'from-blue-600 to-orange-700'
  },
  {
    id: 'black-friday',
    name: 'Black Friday',
    season: 'November 29',
    icon: Zap,
    defaultText: 'BLACK FRIDAY: Massive 60% OFF all plans! Limited time only!',
    type: 'promo',
    bannerIcon: 'zap',
    effect: 'fireworks',
    gradient: 'from-slate-800 to-slate-900'
  },
  {
    id: 'cyber-monday',
    name: 'Cyber Monday',
    season: 'December 2',
    icon: Sparkle,
    defaultText: 'CYBER MONDAY: 55% OFF Elite tier + Free setup! Digital deals end tonight!',
    type: 'promo',
    bannerIcon: 'zap',
    effect: 'fireworks',
    gradient: 'from-blue-600 to-blue-700'
  },
  {
    id: 'christmas',
    name: 'Christmas',
    season: 'December 15-31',
    icon: TreePine,
    defaultText: 'Merry Christmas! Gift your team automation - 45% off all plans!',
    type: 'promo',
    bannerIcon: 'star',
    effect: 'snow',
    gradient: 'from-red-600 to-blue-700'
  },
  {
    id: 'year-end',
    name: 'Year End Sale',
    season: 'December 28-31',
    icon: Cake,
    defaultText: 'End the year strong! Final sale: 50% off + free migration assistance!',
    type: 'promo',
    bannerIcon: 'trending',
    effect: 'fireworks',
    gradient: 'from-indigo-600 to-purple-700'
  },
];

const ICON_OPTIONS = [
  { value: 'alert', label: 'Alert', icon: AlertCircle },
  { value: 'clock', label: 'Clock', icon: Clock },
  { value: 'users', label: 'Users', icon: Users },
  { value: 'zap', label: 'Lightning', icon: Zap },
  { value: 'trending', label: 'Trending', icon: TrendingUp },
  { value: 'award', label: 'Award', icon: Award },
  { value: 'bell', label: 'Bell', icon: Bell },
  { value: 'message', label: 'Message', icon: MessageCircle },
  { value: 'star', label: 'Star', icon: Star },
  { value: 'heart', label: 'Heart', icon: Heart },
];

const EMOJI_OPTIONS = [
  '🎉', '🎊', '✨', '⭐', '💫', '🌟', '💝', '❤️', '💕', '🎁',
  '🔥', '⚡', '💎', '🏆', '👑', '🎯', '🚀', '💰', '📢', '⚠️',
  '✅', '❌', '📊', '📈', '💡', '🎨', '🎭', '🎪', '🎆', '🎇'
];

interface BannerManagerProps {
  open: boolean;
  onClose: () => void;
  currentBanners?: BannerMessage[];
  onSave?: (banners: BannerMessage[]) => void;
  onSendCommand?: (command: string) => void;
}

export function BannerManager({ 
  open, 
  onClose, 
  currentBanners = [], 
  onSave,
  onSendCommand 
}: BannerManagerProps) {
  const [activeTab, setActiveTab] = useState<'templates' | 'custom' | 'manage'>('templates');
  const [customText, setCustomText] = useState('');
  const [customType, setCustomType] = useState<'info' | 'warning' | 'success' | 'promo'>('info');
  const [customIcon, setCustomIcon] = useState('star');
  const [customLink, setCustomLink] = useState('');
  const [customEmoji, setCustomEmoji] = useState('');
  const [customImageUrl, setCustomImageUrl] = useState('');
  const [enableSparkles, setEnableSparkles] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [previewBanner, setPreviewBanner] = useState<HolidayTemplate | null>(null);
  const [livePreview, setLivePreview] = useState(false);
  const [editingBanner, setEditingBanner] = useState<BannerMessage | null>(null);
  const [editText, setEditText] = useState('');
  const [editType, setEditType] = useState<'info' | 'warning' | 'success' | 'promo'>('info');
  const [editIcon, setEditIcon] = useState('star');
  const [editLink, setEditLink] = useState('');

  const handleUseTemplate = (template: HolidayTemplate) => {
    const command = `/banner add "${template.defaultText}" ${template.type} ${template.bannerIcon}`;
    if (onSendCommand) {
      onSendCommand(command);
      onClose();
    }
  };

  const handleCreateCustom = () => {
    const link = customLink ? `https://${customLink.replace(/^https?:\/\//, '')}` : '';
    const command = `/banner add "${customText}" ${customType} ${customIcon}${link ? ` ${link}` : ''}`;
    if (onSendCommand) {
      onSendCommand(command);
      onClose();
    }
  };

  const handleRemoveBanner = (bannerId: string) => {
    const command = `/banner remove ${bannerId}`;
    if (onSendCommand) {
      onSendCommand(command);
    }
  };

  const handleToggleBanner = (bannerId: string, enabled: boolean) => {
    const command = `/banner toggle ${bannerId} ${enabled ? 'on' : 'off'}`;
    if (onSendCommand) {
      onSendCommand(command);
    }
  };

  const handleEditBanner = (banner: BannerMessage) => {
    setEditingBanner(banner);
    setEditText(banner.text);
    setEditType(banner.type === 'queue' ? 'info' : banner.type);
    setEditIcon(banner.icon || 'star');
    setEditLink(banner.link || '');
  };

  const handleSaveEdit = () => {
    if (!editingBanner) return;
    const link = editLink ? `https://${editLink.replace(/^https?:\/\//, '')}` : '';
    const command = `/banner edit ${editingBanner.id} "${editText}" ${editType} ${editIcon}${link ? ` ${link}` : ''}`;
    if (onSendCommand) {
      onSendCommand(command);
      setEditingBanner(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 flex flex-col">
        <DialogHeader className="p-6 pb-4 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Sparkles className="w-6 h-6 text-blue-600" />
            Banner Manager
          </DialogTitle>
          <DialogDescription>
            Create engaging announcement banners with holiday templates and custom designs
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3 mx-6 flex-shrink-0">
            <TabsTrigger value="templates" data-testid="tab-templates">
              <Gift className="w-4 h-4 mr-2" />
              Holiday Templates
            </TabsTrigger>
            <TabsTrigger value="custom" data-testid="tab-custom">
              <Plus className="w-4 h-4 mr-2" />
              Custom Banner
            </TabsTrigger>
            <TabsTrigger value="manage" data-testid="tab-manage">
              <Eye className="w-4 h-4 mr-2" />
              Manage ({currentBanners.length})
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 px-6 pb-6">
            <TabsContent value="templates" className="mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {HOLIDAY_TEMPLATES.map((template) => (
                  <Card key={template.id} className="overflow-hidden hover-elevate">
                    <div className={`h-2 bg-gradient-to-r ${template.gradient}`} />
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <template.icon className="w-5 h-5" />
                        {template.name}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        {template.season}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {template.defaultText}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {template.type}
                        </Badge>
                        {template.effect !== 'none' && (
                          <Badge variant="outline" className="text-xs">
                            {template.effect} effect
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          onClick={() => handleUseTemplate(template)} 
                          size="sm" 
                          className="flex-1"
                          data-testid={`button-use-template-${template.id}`}
                        >
                          <Zap className="w-3 h-3 mr-1" />
                          Use Template
                        </Button>
                        <Button 
                          onClick={() => setPreviewBanner(template)} 
                          size="sm" 
                          variant="outline"
                          data-testid={`button-preview-${template.id}`}
                        >
                          <Eye className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="custom" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Create Custom Banner</CardTitle>
                  <CardDescription>
                    Design your own announcement with custom text, colors, and icons
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="custom-text">Banner Message *</Label>
                    <Textarea
                      id="custom-text"
                      placeholder="Enter your announcement message..."
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      rows={3}
                      data-testid="input-custom-text"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="custom-type">Banner Type</Label>
                      <Select value={customType} onValueChange={(v: any) => setCustomType(v)}>
                        <SelectTrigger id="custom-type" data-testid="select-custom-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="info">Info (Blue)</SelectItem>
                          <SelectItem value="warning">Warning (Yellow)</SelectItem>
                          <SelectItem value="success">Success (Green)</SelectItem>
                          <SelectItem value="promo">Promo (Purple)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="custom-icon">Icon</Label>
                      <Select value={customIcon} onValueChange={setCustomIcon}>
                        <SelectTrigger id="custom-icon" data-testid="select-custom-icon">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ICON_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <div className="flex items-center gap-2">
                                <opt.icon className="w-4 h-4" />
                                {opt.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="custom-link">Link (Optional)</Label>
                    <Input
                      id="custom-link"
                      placeholder="example.com/promo"
                      value={customLink}
                      onChange={(e) => setCustomLink(e.target.value)}
                      data-testid="input-custom-link"
                    />
                  </div>

                  <Button 
                    onClick={handleCreateCustom} 
                    disabled={!customText.trim()}
                    className="w-full"
                    data-testid="button-create-custom"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create & Publish Banner
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="manage" className="mt-4 space-y-4">
              {currentBanners.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-slate-500">
                    <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No active banners. Create one using templates or custom design.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {currentBanners.map((banner) => (
                    <Card key={banner.id} className="overflow-hidden">
                      <div className={`h-1 ${
                        banner.type === 'info' ? 'bg-blue-600' :
                        banner.type === 'warning' ? 'bg-yellow-600' :
                        banner.type === 'success' ? 'bg-blue-600' :
                        'bg-purple-600'
                      }`} />
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-sm font-medium mb-1">{banner.text}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary" className="text-xs">
                                {banner.type}
                              </Badge>
                              {banner.icon && (
                                <Badge variant="outline" className="text-xs">
                                  {banner.icon} icon
                                </Badge>
                              )}
                              <div className="flex items-center gap-2 ml-2">
                                <Label htmlFor={`toggle-${banner.id}`} className="text-xs text-slate-600 dark:text-slate-400">
                                  {banner.enabled !== false ? 'ON' : 'OFF'}
                                </Label>
                                <Switch
                                  id={`toggle-${banner.id}`}
                                  checked={banner.enabled !== false}
                                  onCheckedChange={(checked) => handleToggleBanner(banner.id, checked)}
                                  data-testid={`toggle-${banner.id}`}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditBanner(banner)}
                              data-testid={`button-edit-${banner.id}`}
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setCustomText(banner.text);
                                // Filter out 'queue' type since it's not available in custom
                                const type = banner.type === 'queue' ? 'info' : banner.type;
                                setCustomType(type);
                                setActiveTab('custom');
                              }}
                              data-testid={`button-copy-${banner.id}`}
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRemoveBanner(banner.id)}
                              data-testid={`button-remove-${banner.id}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="p-4 border-t bg-slate-50 dark:bg-slate-900 flex-shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              💡 Tip: Banners update instantly for all users via WebSocket
            </p>
            <Button variant="outline" onClick={onClose} data-testid="button-close-manager">
              Close
            </Button>
          </div>
        </div>

        {/* Preview Dialog */}
        {previewBanner && (
          <Dialog open={!!previewBanner} onOpenChange={() => setPreviewBanner(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Banner Preview: {previewBanner.name}</DialogTitle>
              </DialogHeader>
              <div className={`p-6 rounded-lg bg-gradient-to-r ${previewBanner.gradient} text-white`}>
                <div className="flex items-center gap-3">
                  <previewBanner.icon className="w-6 h-6 flex-shrink-0 animate-pulse" />
                  <p className="text-lg font-semibold">{previewBanner.defaultText}</p>
                </div>
                {previewBanner.effect !== 'none' && (
                  <p className="mt-2 text-sm opacity-90">
                    ✨ Includes {previewBanner.effect} animation effect
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPreviewBanner(null)}>
                  Close
                </Button>
                <Button onClick={() => {
                  handleUseTemplate(previewBanner);
                  setPreviewBanner(null);
                }}>
                  Use This Template
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Edit Dialog */}
        {editingBanner && (
          <Dialog open={!!editingBanner} onOpenChange={() => setEditingBanner(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Edit className="w-5 h-5 text-blue-600" />
                  Edit Banner
                </DialogTitle>
                <DialogDescription>
                  Update banner message and settings
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-text">Banner Message</Label>
                  <Textarea
                    id="edit-text"
                    placeholder="Enter your promotional message..."
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    data-testid="input-edit-text"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-type">Type</Label>
                    <Select value={editType} onValueChange={(v) => setEditType(v as any)}>
                      <SelectTrigger id="edit-type" data-testid="select-edit-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="success">Success</SelectItem>
                        <SelectItem value="promo">Promo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-icon">Icon</Label>
                    <Select value={editIcon} onValueChange={setEditIcon}>
                      <SelectTrigger id="edit-icon" data-testid="select-edit-icon">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ICON_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-link">Link (Optional)</Label>
                  <Input
                    id="edit-link"
                    placeholder="example.com/promo"
                    value={editLink}
                    onChange={(e) => setEditLink(e.target.value)}
                    data-testid="input-edit-link"
                  />
                </div>

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setEditingBanner(null)}
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveEdit}
                    disabled={!editText.trim()}
                    data-testid="button-save-edit"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
