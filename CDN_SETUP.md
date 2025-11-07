# Cloud CDN Setup for AutoForce™ Object Storage

## Overview
Enable Cloud CDN for your Google Cloud Storage bucket to deliver images and files faster to users worldwide. CDN (Content Delivery Network) caches your files at edge locations close to users.

## Benefits
- ⚡ **Faster loading**: Files served from nearest location
- 💰 **Lower costs**: Reduced egress from origin storage
- 🌍 **Global reach**: 100+ edge locations worldwide
- 📈 **Better UX**: Instant image/video loading

## Setup Steps (5 minutes)

### Option 1: Google Cloud Console (Easiest)

1. **Navigate to Cloud Storage**
   - Go to: https://console.cloud.google.com/storage
   - Select your bucket (the one used by AutoForce™)

2. **Enable Cloud CDN**
   - Click on bucket name → Configuration tab
   - Scroll to "Cloud CDN" section
   - Click "Enable Cloud CDN"
   - Select "Create a new backend bucket"

3. **Configure Load Balancer** (auto-created)
   - Name: `autoforce-cdn-lb` (or similar)
   - Backend bucket: Your storage bucket
   - Enable cache: ✅
   - Cache mode: "Cache static content"
   - Default TTL: 3600 seconds (1 hour)

4. **Update CORS Settings**
   ```json
   [
     {
       "origin": ["*"],
       "method": ["GET", "HEAD"],
       "responseHeader": ["Content-Type"],
       "maxAgeSeconds": 3600
     }
   ]
   ```

5. **Get CDN URL**
   - After setup, you'll get a URL like: `https://storage.googleapis.com/YOUR_BUCKET/`
   - CDN-enabled URL: `https://cdn.example.com/` (via load balancer)

### Option 2: gcloud CLI (Fastest)

```bash
# 1. Set your bucket name
export BUCKET_NAME="your-bucket-name"

# 2. Create backend bucket
gcloud compute backend-buckets create autoforce-cdn-backend \
    --gcs-bucket-name=$BUCKET_NAME \
    --enable-cdn

# 3. Create URL map
gcloud compute url-maps create autoforce-cdn-map \
    --default-backend-bucket=autoforce-cdn-backend

# 4. Create HTTP(S) proxy
gcloud compute target-http-proxies create autoforce-http-proxy \
    --url-map=autoforce-cdn-map

# 5. Create forwarding rule (gets you the IP)
gcloud compute forwarding-rules create autoforce-cdn-rule \
    --global \
    --target-http-proxy=autoforce-http-proxy \
    --ports=80

# 6. Get the CDN IP address
gcloud compute forwarding-rules describe autoforce-cdn-rule --global --format="get(IPAddress)"
```

## Update AutoForce™ Code

After CDN setup, update the file upload flow to use CDN URLs:

### Backend (server/routes.ts)

```typescript
// Add CDN_DOMAIN to environment
const CDN_DOMAIN = process.env.CDN_DOMAIN || `https://storage.googleapis.com/${bucketName}`;

// In upload endpoint, return CDN URL instead of storage URL
const cdnUrl = `${CDN_DOMAIN}/${fileName}`;
res.json({ fileUrl: cdnUrl, fileName });
```

### Add Environment Variable

In your Replit Secrets:
```
CDN_DOMAIN=https://YOUR_CDN_IP_OR_DOMAIN
```

Or use Cloud Load Balancer domain:
```
CDN_DOMAIN=https://cdn.autoforce.example.com
```

## Image Optimization (Bonus)

Cloud CDN supports automatic image optimization:

### Enable Image Optimization
```bash
gcloud compute backend-buckets update autoforce-cdn-backend \
    --enable-cdn \
    --cache-mode=CACHE_ALL_STATIC
```

### Use Query Parameters
Your images can be auto-optimized with URL params:
```
https://cdn.example.com/image.jpg?width=800&format=webp
```

This requires Cloud CDN with "Automatic image optimization" enabled.

## Verification

Test CDN is working:

```bash
# Check for CDN headers
curl -I https://YOUR_CDN_URL/test-image.jpg

# Look for these headers:
# X-Cache: HIT (means CDN cache hit)
# Age: 120 (time in cache)
# Cache-Control: public, max-age=3600
```

## Cost Estimate

Cloud CDN pricing (as of 2024):
- **Cache fill (origin → CDN)**: $0.04 - $0.08/GB
- **Cache egress (CDN → users)**: $0.04 - $0.15/GB
- **Invalidation requests**: $0.005 per request

Example: 100GB/month of images
- Storage: $2.30 (GCS)
- CDN cache fill: ~$4
- CDN delivery: ~$8
- **Total: ~$15/month** vs $23 without CDN + faster delivery!

## Troubleshooting

**CDN not caching?**
- Check `Cache-Control` headers are set
- Verify backend bucket connection
- Check CORS settings

**Images not loading?**
- Verify bucket is public or has proper permissions
- Check firewall rules
- Test direct storage URL first

**Slow first load?**
- First request populates cache ("cache miss")
- Subsequent requests are fast ("cache hit")
- Use cache warming for critical files

## Advanced: Custom Domain

Set up a custom domain for your CDN:

1. Reserve static IP:
   ```bash
   gcloud compute addresses create autoforce-cdn-ip --global
   ```

2. Point DNS A record:
   ```
   cdn.autoforce.com → YOUR_STATIC_IP
   ```

3. Add SSL certificate:
   ```bash
   gcloud compute ssl-certificates create autoforce-cdn-cert \
       --domains=cdn.autoforce.com
   ```

4. Update load balancer to use HTTPS

## Support

For issues:
- Google Cloud CDN docs: https://cloud.google.com/cdn/docs
- AutoForce™ support: Contact your platform admin

---

**Last updated**: November 2025
**AutoForce™ Technical Documentation**
