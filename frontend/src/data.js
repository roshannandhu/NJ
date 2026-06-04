export const DEFAULT_DATA = {
  company: {
    name: "NJ India Trading Pvt. Ltd.",
    address: "KNH Building, Neelithod Bridge, Parakkal, Bypass Road\nRamanattukara PO, Kozhikode — 673633, Kerala",
    phone: "+91 73566 08633",
    website: "www.njindia.in"
  },
  settings: {
    taxEnabled: true,
    taxRate: 18,
    discountEnabled: false,
    discountRate: 0,
    discountType: 'percent',
    quotationPrefix: "NJ-Q",
    warrantyPrefix: "NJ-W",
    pinEnabled: false,
    pin: "1234",
    installationEnabled: false,
    termsText: "1. All payments must be made in advance.\n2. Goods once sold will not be taken back.\n3. Subject to Kozhikode jurisdiction."
  },
  brands: [
    { id: "nj", name: "NJ", logo: "", description: "NJ India in-house roofing brand.", order: 0, active: true }
  ],
  classes: [
    { id: "c1", name: "NJ Premium Laminated", subtitle: "Asphalt Shingles", description: "Premium dual-layer asphalt shingles for dimensional appearance.", warrantyId: "nj_laminated", color: "#6e3f32", type: "tiles", brandId: "nj" },
    { id: "c2", name: "Docke PIE", subtitle: "Bitumen Shingles", description: "High-quality European bitumen shingles.", warrantyId: "docke", color: "#3a506b", type: "tiles", brandId: "nj" },
    { id: "c3", name: "NJ Premium Ceramic", subtitle: "Ceramic Roof Tiles", description: "Classic clay ceramic roofing.", warrantyId: "ceramic", color: "#b95c3a", type: "tiles", brandId: "nj" },
    { id: "c4", name: "NJ Stone Coated", subtitle: "Metal Tiles", description: "Durable metal roofing with natural stone chip coating.", warrantyId: "stone_coated", color: "#4b4b4b", type: "tiles", brandId: "nj" },
    { id: "c5", name: "Heatout", subtitle: "Insulated Ceilings", description: "Thermal insulation ceiling panels.", warrantyId: "heatout", color: "#4f755a", type: "tiles", brandId: "nj" },
    { id: "cls_tools", name: "Tools & Accessories", subtitle: "Installation Hardware", description: "Screws, silicone, touch-up kits, ridges, gutters and all installation accessories.", warrantyId: null, color: "#8a857a", type: "tools", brandId: "nj" }
  ],
  varieties: [
    { id: "v1", classId: "c1", name: "Laminated Standard", description: "Classic dual-layer", basePrice: 85, unit: "sqft", colors: [{ name: "Autumn Brown", hex: "#6e3f32", offset: 0 }, { name: "Estate Gray", hex: "#5b5b5b", offset: 0 }] },
    { id: "v2", classId: "c2", name: "PIE Classic", description: "Standard single layer", basePrice: 70, unit: "sqft", colors: [{ name: "Red", hex: "#8b2525", offset: 0 }] },
    { id: "v3", classId: "c3", name: "Mediterranean Curve", description: "Curved profile", basePrice: 45, unit: "pcs", colors: [{ name: "Natural Terracotta", hex: "#b95c3a", offset: 0 }] },
    { id: "v10", classId: "cls_tools", name: "Roofing Screw", description: "Galvanised steel screws, 2 inch", basePrice: 6, unit: "nos", colors: [] },
    { id: "v11", classId: "cls_tools", name: "Silicone Tube", description: "Weather-grade silicone sealant", basePrice: 250, unit: "nos", colors: [] },
    { id: "v12", classId: "cls_tools", name: "Touch-up Kit", description: "Colour-matched touch-up paint kit", basePrice: 800, unit: "pcs", colors: [] }
  ],
  warranties: [
    {
      id: 'docke',
      title: 'Docke PIE — Bitumen Shingle',
      logo: 'Döcke',
      opening: 'Congratulations on your purchase of Docke PIE Bitumen Shingle. We did our best to ensure that our products fully meet your requirements and that the quality corresponds to the highest world standards.\nWe strongly recommend that you read this document thoroughly to ensure you are well-informed about the warranty coverage of your purchase.',
      sections: [
        {
          title: 'Manufacturer Details',
          content: 'Manufacturer: OOO"DHS"INN (Taxpayer Identification Number) 7713741050\nLocation: 601021, Russia, Vladimir Region, Kirzhachsky District, Fedorovskoe Village, Selskya Street, 51/1',
          isBullets: false
        },
        {
          title: '1. Product Information:',
          content: 'The purpose of the product: The roofing piece material Bitumen Shingles DOcke PIE is intended for use on pitched roofs of buildings and constructions with a roof slope from 12 to 90 degrees. Products are manufactured as individual sheets of shingles and supplied in bundles.',
          isBullets: false
        },
        {
          title: '2. The quality of products and their safety are confirmed by:',
          content: 'Certificate of conformity GOST R\nCertificate of Fire Safety\nDeclaration of Performance (DoP) Certificate',
          isBullets: true
        },
        {
          title: '3. Warranty terms and conditions:',
          content: '10 Year Service Warranty\nThe warranty period is calculated from the moment the product was sold, the date of which is indicated in the warranty certificate. If the date of sale is impossible to establish, the warranty period is calculated from the date of manufacture. The defects that could be detected before the installation work are not subject to compensation.',
          isBullets: false
        },
        {
          title: '4. The warranty is valid under all of the following conditions:',
          content: 'Fully completed warranty certificate, including the STAMP of the trading organization and the buyer\'s signature.\nThe products were used for the purpose that corresponds to their intended purpose.\nProducts were mounted only with the use of original components: starter/ridge, valley membrane; mastics; underlayment used on the entire surface of the roof.\nThe products were used in full compliance with the manufacturer Docke PIE Installation manual, Which was valid at the time of installation. Warranty not available for installation mistake',
          isBullets: true
        },
        {
          title: '5. The warranty does not apply to products:',
          content: 'Damaged because of force majeure circumstances, including a hurricane, lightning, earthquake, etc.\nInstalled in violation of the Docke PIE Manual\nDamaged because of violation of the rules of storage and operation, which are specified in the producer installation manual.\nDamaged because of deformations resulting from the natural shrinkage of buildings or structures, as well as errors made during construction',
          isBullets: true
        },
        {
          title: 'The Manufacturer guarantees to the final buyer:',
          content: 'Conformity of products to EN 544:2011(GOST 32806-2014) Asphalt Shingles standard\nCompliance with fire safety standards\nWater - resistance subject to fulfillment of part 4 of this warranty certificate.\nColor stability*\n*Color stability - Even color change caused by the influence of climatic factors. If the material, which is to be replaced at the time of the claim has been changed in color or discontinued, will be replaced by the manufacturer with the similar one',
          isBullets: true
        }
      ],
      showSeriesTable: true,
      seriesTable: [
        { series: 'PIE Classic', duration: '10 years' },
        { series: 'PIE Comfort', duration: '15 years' },
        { series: 'PIE Lux', duration: '25 years' }
      ]
    },
    {
      id: 'nj_laminated',
      title: 'NJ Laminated — Asphalt Shingle',
      logo: 'NJ Laminated',
      opening: 'Congratulations on your purchase of NJ Laminated shingle. We did our best to ensure that our products fully meet your requirements and that the quality corresponds to the highest world standards.\nWe strongly recommend that you read this document thoroughly to ensure you are well-informed about the warranty coverage of your purchase.',
      sections: [
        {
          title: '1. Product Information:',
          content: 'The purpose of the product: The roofing piece material NJ Laminated is intended for use on pitched roofs of buildings and constructions with a roof slope from 12 to 90 degrees. Products are manufactured as individual sheets of shingles and supplied in bundles.',
          isBullets: false
        },
        {
          title: '2. The quality of products and their safety are confirmed by:',
          content: 'Certificate of conformity GOST R\nCertificate of Fire Safety\nDeclaration of Performance (DoP) Certificate',
          isBullets: true
        },
        {
          title: '3. Warranty terms and conditions:',
          content: 'The warranty period is calculated from the moment the product was sold, the date of which is indicated in the warranty certificate. If the date of sale is impossible to establish, the warranty period is calculated from the date of manufacture. The defects that could be detected before the installation work are not subject to compensation.',
          isBullets: false
        },
        {
          title: '4. The warranty is valid under all of the following conditions:',
          content: '10 Year service Warranty\nFully completed warranty certificate, including the STAMP of the trading organization and the buyer\'s signature.\nThe products were used for the purpose that corresponds to their intended purpose.\nProducts were mounted only with the use of original components: starter/ridge, valley membrane; mastics; underlayment used on the entire surface of the roof.\nThe products were used in full compliance with the manufacturer NJ Laminated Installation manual, Which was valid at the time of installation.',
          isBullets: true
        },
        {
          title: '5. The warranty does not apply to products:',
          content: 'Damaged because of force majeure circumstances, including a hurricane, lightning, earthquake, etc.\nInstalled in violation of the NJ Laminated Manual\nDamaged because of violation of the rules of storage and operation, which are specified in the producer installation manual.\nDamaged because of deformations resulting from the natural shrinkage of buildings or structures, as well as errors made during construction, warranty not available for installation mistake',
          isBullets: true
        },
        {
          title: 'The Manufacturer guarantees to the final buyer:',
          content: 'Conformity of products to EN 544:2011(GOST 32806-2014) Asphalt Shingles standard\nCompliance with fire safety standards\nWater - resistance subject to fulfillment of part 4 of this warranty certificate.\nColor stability*\n*Color stability - Even color change caused by the influence of climatic factors. If the material, which is to be replaced at the time of the claim has been changed in color or discontinued, will be replaced by the manufacturer with the similar one',
          isBullets: true
        }
      ],
      showSeriesTable: true,
      seriesTable: [
        { series: 'NJ Premium 35', duration: '35 years' },
        { series: 'NJ Standard', duration: '20 years' }
      ]
    },
    {
      id: 'ceramic',
      title: 'NJ Ceramic Roof Tiles',
      logo: 'NJ Ceramic',
      opening: 'Congratulations on your purchase of NJ premium ceramic roof tiles. We did our best to ensure that our products fully meet your requirements and that the quality corresponds to the highest world standards.\nWe strongly recommend that you read this document thoroughly to ensure you are well-informed about the warranty coverage of your purchase',
      sections: [
        {
          title: 'Company Details : NJ',
          content: 'Company Name : NJ INDIA\nAddress : KNH Building, Near Neelithod Bridge, NH66 Service Road, Ramanattukara, Calicut - Kerala 673633\nCertificate : ISO 9001 : 2015, ISO 14001 : 2015, CE',
          isBullets: false
        },
        {
          title: 'The warranty does not apply to products:',
          content: 'Damaged because of force majeure circumstances, including a hurricane, lightning, earthquake, etc.\nInstalled in violation of the Ceramic tile installation manual\nDamaged because of violation of the rules of storage and operation, which are specified in the producer installation manual.\nDamaged because of deformations resulting from the natural shrinkage of buildings or structures, as well as errors made during construction warranty not available for installation mistake',
          isBullets: true
        },
        {
          title: 'The Manufacturer guarantees to the final buyer:',
          content: 'Compliance with fire safety standards\nWater - resistance subject to fulfillment of part 4 of this warranty certificate.\nColor stability*\n*Color stability - Even color change caused by the influence of climatic factors. If the material, which is to be replaced at the time of the claim has been changed in color or discontinued, will be replaced by the manufacturer with the similar one',
          isBullets: true
        }
      ],
      showSeriesTable: true,
      seriesTable: [
        { series: 'Mediterranean', duration: '15 years' },
        { series: 'Flat Premium', duration: '20 years' }
      ]
    },
    {
      id: 'stone_coated',
      title: 'NJ Stone Coated Roof Tiles',
      logo: 'NJ Stone Coated',
      opening: 'Congratulations on your purchase of NJ Stone Coated Roof Tiles. We did our best to ensure that our products fully meet your requirements and that the quality corresponds to the highest world standards.\nWe strongly recommend that you read this document thoroughly to ensure you are well-informed about the warranty coverage of your purchase.',
      sections: [
        {
          title: 'NJ India Specifically Warrants',
          content: '10 Year Service Warranty\n1) The product will maintain its surface coating Appearance Except for normal weather (Normal weather may include minor granule loss or minor fading)\n2) The product will withstand winds of up to 120 mph\n3) The product will not warp, lift or curl when installed in accordance with the applicable local code and NJ India\'s installation standards and instructions found at www.njindia.in\n4) The product will not be penetrated by hailstones less than 2 and half inches diameter',
          isBullets: true
        },
        {
          title: 'Remedy',
          content: 'If any product is found to exhibit the specified defects covered under this warranty, NJ India shall, at its option, only repair or maintain the product, and NJ India\'s liability shall be limited.\n1) For the first 10 years of the warranty period, NJ India will furnish servicing products for each defective product and the reasonable cost of labour for the damaged defective products. The product is covered by a ten-years warranty on surface granule retention\n2) For years 11 through 50 of the warranty period, NJ India will furnish replacement NJ India reserves the right to remove or have removed sufficient undamaged products for examination before providing any replacement product or reimbursement, and NJ India will attempt to replace defective products with new products having the same colour and design. However, colour variations may exist between products manufactured at different times, and NJ India may discontinue or change the design of a particular product profile. In any event, NJ India reserves the right to replace the defective product with another product of any design and colour, or to repair or replace the defective product. Shall not extend the term of this warranty. This warranty shall be void if anyone makes repairs or modifications to products that are not first approved in writing by NJ India, except for necessary emergency repairs. fifty-years warranty against corrosion and rust perforation, subject to standard terms and conditions.',
          isBullets: true
        },
        {
          title: 'Registration & Transfer:',
          content: 'This warranty automatically transfers to any subsequent owners of the property during the term of the warranty. But the sale or transfer of the property does not obviate any of the terms or conditions set out here in order to obtain or maintain warranty coverage.',
          isBullets: false
        },
        {
          title: 'Specific Exclusions: This warranty does not cover',
          content: 'Damage to products occurs during installation or by improper installation, including but not limited to failure to install in accordance with appropriate local building codes and acceptable trade practices in the specified area and failure to follow NJ India\'s instructions.\n1) Damage to the products caused by roof traffic or foreign objects falling onto the roof.\n2) Damage to products or property caused by hurricanes or tornadoes with wind speeds in excess of 120 mph, or damage costs to products. Frontal debris contact resulting from hurricane or tornado force wind\n3) Damage to products caused by other acts of God, such as climate-specific conditions. Including, but not limited to, mould, mildew, or other growth\n4) Damage to products caused by any failure or movement of any structural elements of the property. Colour fading, colour changes, or variations of the colour hue due to physical deterioration of the colour for any reason, including but not limited to weathering, oxidation, colour pollutants, air pollutants, or improper cleaning, don\'t cover the leak proof warranty for the used materials. warranty not available for installation mistake',
          isBullets: true
        },
        {
          title: 'LIMITATIONS ON LIABILITY',
          content: 'THE FOREGOING IS THE ENTIRE EXPRESS LIMITED PRODUCT WARRANTY OF NJ INDIA FOR THE PRODUCTS. NJ AND INDIA HEREBY DISCLAIM ALL OTHER EXPRESS IMPLIED AND STATUTORY WARRANTIES ALLOWABLE BY LAW FOR THE PRODUCTS, INCLUDING THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. LIMITATIONS ON LIABILITY NJ AND INDIA SHALL NOT BE LIABLE UNDER ANY CIRCUMSTANCES FOR INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES. CONSEQUENTIAL. DAMAGES FOR LOSS OF PROFIT OR FOR ANY DAMAGES TO ANY PROPERTIES, THEIR CONTENTS, OR THEIR OCCUPANTS , no person, employee, agent, or otherwise, is authorised to vary or change the terms of this warranty, either orally or in writing. And any statements contained in NJ India\'s general advertising pamphlets or other printed materials do not constitute a warranty and shall not be binding on NJ India except as expressly stated in this document.',
          isBullets: false
        },
        {
          title: 'Claims under this warranty will be honoured only if the following conditions are met:',
          content: 'Proof of purchase is provided to NJ India, which is notified 30 days after the facts on which the claim is based became known, and NJ India has the opportunity to investigate and approve the claim. The warranty gives the owner of the property covered by it specific legal rights. And they may have other rights, which may vary from state to state if the laws of a particular state require actions other than or in addition to those contained in this warranty. This warranty shall be deemed modified so as to comply with the appropriate laws of such a state, but only. To the extent it is necessary to prevent the invariity of this warranty or any provision of this warranty, to prevent the imposition of fines and penalties or any liability,',
          isBullets: false
        }
      ],
      showSeriesTable: false,
      seriesTable: []
    },
    {
      id: 'heatout',
      title: 'Heatout Ceilings',
      logo: 'Heatout',
      opening: 'Congratulations on your purchase of Heatout Ceilings. We did our best to ensure that our products fully meet your requirements and that the quality corresponds to the highest world standards.\nWe strongly recommend that you read this document thoroughly to ensure you are well-informed about the warranty coverage of your purchase.',
      sections: [
        {
          title: 'Limitation of Warrantor\'s Liability',
          content: 'The Warrantor shall not be liable for physical defects or damage to the Product resulting from external factors that occurred after the Product was delivered to the Purchaser (the Warrantor recommends insuring the Product, subject to this Warranty, against the effects of external factors), particularly related to:\nUse of the Product contrary to its intended purpose or improper storage and transport prior to installation.\nInstallation contrary to the Product installation and use manual.\nUse of accessories not provided for in the Product installation and use manual.\nImpact of foreign bodies that exceed the level specified in the Document mentioned in § 1(1).\nFire, earthquake, flooding, lightning, strong wind, hail, abnormally high or low air temperatures, or other occurrences that may be classified as force majeure.\nFaults, defects, or other damage to the building or material where the Product is installed, caused in particular by movement, deformation, fractures, or subsidence of walls, materials, or foundations of the building.\nThe Warrantor shall only be liable for defects resulting from reasons attributable to the Product. The Warrantor shall not be liable for discoloration that exceeds the range of allowable discolorations specified in the Product installation and use manual, or for other discoloration caused, most likely by air pollution (including by metal oxides or particles), mold, or exposure to harmful chemicals.\nThis Warranty shall not apply to any Product covered by the Purchaser with any other improvised coating (e.g., paint, varnish, or plaster) or otherwise modified/changed. In the event the Product or any element thereof is replaced under this Warranty, where the Product installed by the Purchaser is no longer manufactured or has been modified by the Warrantor, the Warrantor may apply elements that are the closest equivalents (in terms of type) to the Product originally installed.',
          isBullets: true
        },
        {
          title: 'Obligations of the Warranty Holder',
          content: 'The Warranty Holder should notify the Warrantor of any detected physical defects of the Product immediately after detecting a defect that forms the basis for a claim under the Warranty.\nAny claims made under the Warranty shall be lodged with the Warrantor through the seller from whom the Product was purchased.\nA claim made under the Warranty should include: a description of the defect, the address of the Product installation site, the claimant\'s contact details (full name, address, phone number, email address - if applicable), and photographs proving the defect.\nA claim made under the Warranty may be considered if it is submitted together with this document bearing the stamp and signature of the seller (distributor) of the Product, including the name of the seller, as well as the place and date when the Product was sold.\nThe Warrantor shall provide, by email or in writing, information on the manner of considering the claim no later than 14 days from the date when the Warrantor received the claim (if the information is provided in writing, the period shall be counted from the date of the postmark). The Warrantor stipulates that the consideration of the claim may require inspection of the Product on-site, which implies the Purchaser\'s obligation to make available the immovable property where the Product covered by this Warranty is installed. In such an event, the Warrantor shall contact the Purchaser promptly in order to set the date of inspection, and the above-mentioned period of 14 days shall be counted from the date when the inspection is completed. The inspection shall be performed by an authorized representative of the Warrantor. The Purchaser shall provide the Warrantor with all information and documents necessary for the proper preparation and performance of the inspection.\nWhere the Purchaser\'s claim is deemed justified, the Warrantor shall perform its obligations specified in §1 hereof within 60 days from the date when the Purchaser was provided with the information on the manner of considering the claim, specified in sub-clause 5. At the same time, the Warrantor stipulates that, due to the specific nature of the manufacturing process, the aforementioned period of 60 days may be extended by the time necessary to produce and deliver the elements needed to replace the Product.\nAll parts and elements of the Product replaced hereunder shall become the Warrantor\'s property upon the day they are replaced with other parts and elements.',
          isBullets: true
        },
        {
          title: 'Warranty Conditions',
          content: 'This warranty shall be valid for period specified in document counted from the date when purchaser purchased the product stated in the warranty certificate or another document which makes the purchase possible with the stipulation that warrantor liability shall be proportional to the period when the product was in use in accordance with this following rules\ncolor warranty - 10 years (exterior color warranty - 5 years)',
          isBullets: false
        }
      ],
      showSeriesTable: false,
      seriesTable: [],
      heatoutTable: true
    }
  ],
  quotations: [],
  warranty_certificates: []
};
