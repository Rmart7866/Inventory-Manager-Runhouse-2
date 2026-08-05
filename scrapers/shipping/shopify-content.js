// Shopify Order Page - Content Script
console.log('Shopify B2B Helper loaded');

// Wait for page to load and add our button
function init() {
  // Run multiple times to catch dynamic content loading
  setTimeout(addCopyButton, 1000);
  setTimeout(addCopyButton, 2000);
  setTimeout(addCopyButton, 3000);
  
  // Also watch for navigation changes (Shopify is a SPA)
  const observer = new MutationObserver(() => {
    if (window.location.href.includes('/orders/') || window.location.href.includes('/customers/')) {
      addCopyButton();
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function addCopyButton() {
  // Check if we already added our button
  if (document.querySelector('#b2b-copy-btn')) {
    return;
  }
  
  // Detect page type
  const isOrderPage = window.location.href.includes('/orders/');
  const isCustomerPage = window.location.href.includes('/customers/');
  
  if (!isOrderPage && !isCustomerPage) {
    return;
  }
  
  let shippingAddressElement = null;
  let addressData = null;
  
  if (isOrderPage) {
    // ORDER PAGE: Find the <p> that contains the shipping address
    const shippingElements = document.querySelectorAll('p');
    
    for (const el of shippingElements) {
      const text = el.textContent;
      // Check if it looks like a shipping address (has phone number pattern)
      if (text.includes('+1') || /\(\d{3}\)\s?\d{3}-\d{4}/.test(text)) {
        // Make sure it has line breaks (full address format)
        if (el.innerHTML.includes('<br>')) {
          shippingAddressElement = el;
          break;
        }
      }
    }
  } else if (isCustomerPage) {
    // CUSTOMER PAGE: Find the default address section
    const addressContainers = document.querySelectorAll('.Polaris-LegacyStack--vertical');
    
    for (const container of addressContainers) {
      const spans = container.querySelectorAll('span[data-key]');
      if (spans.length >= 3) {
        // This looks like an address (has multiple lines)
        shippingAddressElement = container;
        break;
      }
    }
  }
  
  if (!shippingAddressElement) {
    console.log('Shipping address not found on page');
    return;
  }
  
  // Extract the shipping data
  const shippingData = extractShippingData(shippingAddressElement);
  
  if (!shippingData) {
    console.log('Could not extract shipping data');
    return;
  }
  
  console.log('[Shopify] Extracted data:', shippingData);
  
  // Create our custom copy button
  const button = document.createElement('button');
  button.id = 'b2b-copy-btn';
  button.textContent = 'Copy for B2B Form';
  button.style.cssText = `
    background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
    color: white;
    border: none;
    padding: 10px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    margin-top: 10px;
    box-shadow: 0 2px 8px rgba(255, 107, 53, 0.3);
    transition: all 0.2s ease;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  button.onmouseover = () => {
    button.style.transform = 'translateY(-1px)';
    button.style.boxShadow = '0 4px 12px rgba(255, 107, 53, 0.4)';
  };
  
  button.onmouseout = () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 2px 8px rgba(255, 107, 53, 0.3)';
  };
  
  button.onclick = () => {
    const formatted = shippingData.formatted;
    const poNumber = shippingData.poNumber;
    const email = shippingData.email;
    
    console.log('[Shopify Button] Storing data:', {
      shippingData: formatted,
      poNumber: poNumber,
      email: email,
      orderNumber: shippingData.orderNumber
    });
    
    // Copy to clipboard
    navigator.clipboard.writeText(formatted).then(() => {
      // Check if extension context is still valid
      if (!chrome.storage) {
        button.textContent = 'Extension reloaded - Refresh page!';
        button.style.background = '#f44336';
        return;
      }
      
      // Store in extension storage for later use
      try {
        chrome.storage.local.set({ 
          shippingData: formatted,
          poNumber: poNumber,
          email: email,
          orderNumber: shippingData.orderNumber,
          timestamp: Date.now()
        }, () => {
          // Check for errors
          if (chrome.runtime.lastError) {
            console.error('Storage error:', chrome.runtime.lastError);
            button.textContent = 'Refresh page and try again';
            button.style.background = '#f44336';
            return;
          }
          
          console.log('[Shopify Button] Data stored successfully!');
          
          // Show success
          let successText = 'Copied for B2B!';
          if (poNumber) successText += ` | PO: ${poNumber}`;
          if (email) successText += ` | Email: ${email}`;
          
          button.textContent = successText;
          button.style.background = '#4CAF50';
          
          setTimeout(() => {
            button.textContent = 'Copy for B2B Form';
            button.style.background = 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)';
          }, 3000);
        });
      } catch (err) {
        console.error('Extension context error:', err);
        button.textContent = 'Refresh page and try again';
        button.style.background = '#f44336';
        
        setTimeout(() => {
          button.textContent = 'Copy for B2B Form';
          button.style.background = 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)';
        }, 3000);
      }
    }).catch(err => {
      console.error('Copy failed:', err);
      button.textContent = 'Copy failed';
      button.style.background = '#f44336';
      
      setTimeout(() => {
        button.textContent = 'Copy for B2B Form';
        button.style.background = 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)';
      }, 2000);
    });
  };
  
  // Insert button after the address
  shippingAddressElement.parentElement.appendChild(button);
  
  console.log('B2B copy button added successfully');
  console.log('Extracted data:', shippingData.formatted);
}

function extractShippingData(element) {
  try {
    // Detect if this is a customer page vs order page
    const isCustomerPage = window.location.href.includes('/customers/');
    
    if (isCustomerPage) {
      return extractCustomerPageData(element);
    } else {
      return extractOrderPageData(element);
    }
    
  } catch (error) {
    console.error('Error extracting shipping data:', error);
    return null;
  }
}

function extractCustomerPageData(element) {
  try {
    // Customer page: extract from span[data-key] elements
    const spans = element.querySelectorAll('span[data-key]');
    
    if (spans.length < 3) {
      console.error('Not enough address lines found in customer page');
      return null;
    }
    
    // Expected format:
    // span[data-key="0"]: Name
    // span[data-key="1"]: Street Address
    // span[data-key="2"]: City State Zip (State is FULL NAME like "Massachusetts")
    // span[data-key="3"]: Country (optional)
    
    const name = spans[0] ? spans[0].textContent.trim().replace(/<br>/g, '') : '';
    const streetAddress = spans[1] ? spans[1].textContent.trim().replace(/<br>/g, '') : '';
    let cityStateZip = spans[2] ? spans[2].textContent.trim().replace(/<br>/g, '') : '';
    const country = spans[3] ? spans[3].textContent.trim().replace(/<br>/g, '') : 'United States';
    
    // Convert full state name to abbreviation
    // Customer pages show "Needham Massachusetts 02492" but we need "Needham MA 02492"
    const stateMap = {
      'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
      'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
      'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
      'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
      'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
      'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
      'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
      'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
      'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
      'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
      'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
      'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
      'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC'
    };
    
    // Replace full state name with abbreviation
    for (const [fullName, abbr] of Object.entries(stateMap)) {
      if (cityStateZip.includes(fullName)) {
        cityStateZip = cityStateZip.replace(fullName, abbr);
        console.log(`[Customer Page] Converted ${fullName} to ${abbr}`);
        break;
      }
    }
    
    console.log('[Customer Page] Extracted cityStateZip:', cityStateZip);
    
    // No phone on customer page
    const phone = '';
    
    // Try to extract email from customer page
    let email = '';
    const emailLinks = document.querySelectorAll('a[href^="mailto:"]');
    if (emailLinks.length > 0) {
      email = emailLinks[0].href.replace('mailto:', '');
    }
    
    // Also try to extract email from timeline text (e.g., "(user@example.com)")
    if (!email) {
      const emailRegex = /\(([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)\)/;
      const bodyText = document.body.textContent;
      const emailMatch = bodyText.match(emailRegex);
      if (emailMatch) {
        email = emailMatch[1];
        console.log('[Customer Page] Found email from timeline text:', email);
      }
    }
    
    // Extract order number from customer timeline (most recent order)
    let orderNumber = '';
    const orderLinks = document.querySelectorAll('a[href*="/orders/"]');
    if (orderLinks.length > 0) {
      // Find first order link with # format (e.g., "#65182")
      // BUT exclude draft orders (e.g., "#D1820")
      for (const link of orderLinks) {
        const text = link.textContent.trim();
        if (text.startsWith('#') && !text.startsWith('#D')) {
          // Only accept regular orders (numbers only, not draft orders)
          const numericPart = text.replace('#', '');
          if (/^\d+$/.test(numericPart)) {
            orderNumber = numericPart;
            console.log('[Customer Page] Found order number from timeline:', orderNumber);
            break;
          }
        }
      }
    }
    
    if (!orderNumber) {
      console.log('[Customer Page] No regular order number found in timeline (draft orders excluded)');
    }
    
    // Extract last name
    const nameParts = name.split(' ');
    const lastName = nameParts[nameParts.length - 1];
    
    // Create PO number: OrderNumber_LastName (if we found an order)
    const poNumber = orderNumber ? `${orderNumber}_${lastName}` : '';
    
    if (poNumber) {
      console.log('[Customer Page] Created PO number:', poNumber);
    } else {
      console.log('[Customer Page] No PO number created');
    }
    
    // Format as: Name, Address, City State Zip, Country
    const formatted = `${name}, ${streetAddress}, ${cityStateZip}, ${country}`;
    
    console.log('[Customer Page] Final formatted:', formatted);
    
    return {
      name,
      streetAddress,
      cityStateZip,
      country,
      phone,
      email,
      orderNumber,
      lastName,
      poNumber,
      formatted
    };
    
  } catch (error) {
    console.error('Error extracting customer page data:', error);
    return null;
  }
}

function extractOrderPageData(element) {
  try {
    // Get the HTML and parse it
    const html = element.innerHTML;
    
    // Split by <br> tags to get individual lines
    const lines = html.split(/<br\s*\/?>/i).map(line => {
      // Remove HTML tags and trim
      const temp = document.createElement('div');
      temp.innerHTML = line;
      return temp.textContent.trim();
    }).filter(line => line.length > 0);
    
    if (lines.length < 4) {
      console.error('Not enough address lines found:', lines);
      return null;
    }
    
    // Expected format:
    // Line 0: Name
    // Line 1: Street Address
    // Line 2: City State Zip
    // Line 3: Country
    // Line 4: Phone (optional, might be in a span)
    
    const name = lines[0];
    const streetAddress = lines[1];
    const cityStateZip = lines[2];
    const country = lines[3];
    
    // Phone might be on line 4 or might need to be extracted from spans
    let phone = lines[4] || '';
    
    // If phone is empty, try to find it in a span
    if (!phone) {
      const phoneSpan = element.querySelector('span');
      if (phoneSpan) {
        phone = phoneSpan.textContent.trim();
      }
    }
    
    // Extract email from page
    let email = '';
    const emailButton = document.querySelector('button.Polaris-Link[type="button"]');
    if (emailButton && emailButton.textContent.includes('@')) {
      email = emailButton.textContent.trim();
    }
    
    // Extract order number from page
    const orderNumberElement = document.querySelector('h1.Polaris-Text--headingLg');
    let orderNumber = '';
    if (orderNumberElement) {
      // Extract just the number from "#65063"
      orderNumber = orderNumberElement.textContent.trim().replace('#', '');
    }
    
    // Extract last name from full name
    const nameParts = name.split(' ');
    const lastName = nameParts[nameParts.length - 1];
    
    // Create PO number: OrderNumber_LastName
    const poNumber = orderNumber ? `${orderNumber}_${lastName}` : '';
    
    // Format as: Name, Address, City State Zip, Country, Phone
    const formatted = `${name}, ${streetAddress}, ${cityStateZip}, ${country}, ${phone}`;
    
    return {
      name,
      streetAddress,
      cityStateZip,
      country,
      phone,
      email,
      orderNumber,
      lastName,
      poNumber,
      formatted
    };
    
  } catch (error) {
    console.error('Error extracting order page data:', error);
    return null;
  }
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

console.log('Shopify B2B Helper initialized');