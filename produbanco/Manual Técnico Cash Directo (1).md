# To) 

**WEBSERVICE - CARGA DIRECTA CASHDIRECTO** 

|Conte|nido|
|---|---|
|**1.**<br>**I**|**NTRODUCCIÓN ....................................................................................................................................................................................................................... 3**|
|**2.**<br>**D**|**EFINICIÓN DE MÉTODOS ..................................................................................................................................................................................................... 4**|
|**2.1**|**CARGA DE ORDEN ............................................................................................................................................................................................................. 5**|
|**2.1.1**|**MÉTODO: DEVUELVEXMLENCRIPTADO ......................................................................................................................................................................... 6**|
|**2.1.2**|**MÉTODO: CARGADIRECTAXML ..................................................................................................................................................................................... 12**|
|**2.2**|**CONSULTA DE ÓRDENES ................................................................................................................................................................................................ 19**|
|**2.2.1**|**MÉTODO: CONSULTAORDENES ..................................................................................................................................................................................... 19**|
|**2.3**|**CONSULTA DE MOVIMIENTOS ....................................................................................................................................................................................... 28**|
|**2.3.1**|**MÉTODO: CONSULTAMOVIMIENTOS ............................................................................................................................................................................ 28**|
|**2.4**|**CATÁLOGO DE RESPUESTAS FRECUENTES EN LA ETIQUETA "MENSAJE" ............................................................................................................. 45**|



## **1. INTRODUCCIÓN** 

Este Documento define en detalle las especificaciones de proceso de carga, consultas, y repuestas del archivo en Cash Management de Produbanco. 

Para el proceso, el cliente debe generar la trama (detalle) con información en base a las especificaciones que se muestran a continuación. 

Es responsabilidad del cliente validar la información generada para el procesamiento. 

Inicialmente se puede realizar las validaciones en un ambiente de pruebas para verificar la funcionalidad, recepción de la información, generación del archivo. 

Para acceder al servicio en ambiente de pruebas, el cliente debe cumplir con los siguientes requisitos: 

- Facilitar la IP publica de testing y el servicio que se asociará al Cashdirecto WEBSERVICE. 

- Datos para la creación del usuario 

Por parte de Produbanco se realiza: 

- Configurar la IP publica de la empresa al servicio que se asocia al Cashdirecto WEBSERVICE 

- Habilitar el usuario con los perfiles y accesos 

En producción se manejará el mismo esquema, se requiere: 

- Atar la IP publica de producción al servicio que manejará Cashdirecto WEBSERVICE. 

- Crear o adicionar el perfil transaccional al usuario de Cash Management. 

- Atar la IP al servicio 

- Realizar las cargas 

En cuanto a esquemas de seguridad podemos mencionar los siguientes: 

   - Manejo de protocolos seguros para la transmisión de datos SSL 

   - Configuración de IP publica y usuario para acceso al servicio 

   - Configuración de perímetros de seguridad entre el emisor y receptor 

   - Manejo de encriptación de tramas para la transmisión y recepción de información 

   - Cabe mencionar que tenemos procesos internos de escaneo de vulnerabilidades que son mitigadas de forma inmediata 

**2. Definición de métodos** 

Para el consumo de los métodos expuestos en el Servicio Web, se debe acceder a las siguientes direcciones: 

URL DE AMBIENTE TEST 

https://webcore.produbanco.ec/easycashdirecto/easycashdirecto.asmx 

IP Publica: 181.198.23.102 

**Nota:** el consumo del servicio en testing debe ser a través del dominio: webcore.produbanco.ec 

URL DE PRODUCCIÓN 

https://cashmanagement.produbanco.com/easycashdirecto/easycashdirecto.asmx 

- **2.1 Carga de orden** 

El proceso de carga de orden implica el uso de dos métodos expuestos en el Servicio web en el siguiente orden: 

1. Método: DevuelveXmlEncriptado, el cual recibe la trama en el formato esperado con la información de los pagos a realizar a través del sistema. El método devuelve una cadena encriptada con los pagos, la cual se debe enviar al método CargaDirectaXML 

2. Método: CargaDirectaXML, el cual recibe la trama o cadena encriptada con la información de los pagos y procede a generar la información necesaria en el sistema para el posterior procesamiento de los mismos. 

## 2.1.1 Método: DevuelveXmlEncriptado 

- Argumentos: 

|Argumento|Descripción|Tipo|
|---|---|---|
|strXmlInput|XML con la información de los pagos.|string|
|strUsuario|Usuario autorizado para realizar la carga.|string|
|strComputador|IP desde el cual se realiza la carga.|string|
|Empresa|Identificador o Nombre de la Empresa. Ej.: 64 o NOMBRE_EMPRESA_343.|string|
||Este nombre de empresa debe ser el mismo con el cual está creado en las<br>empresas de cash||



## • Definición testing 

<mark>POST /WSCashDirecto/easycashdirecto.asmx HTTP/1.1</mark> Host: 172.10.18.74 Content-Type: text/xml; charset=utf-8 Content-Length: length SOAPAction: **"https://webcore.produbanco.ec/easycashdirecto/DevuelveXmlEncriptado"** <?xml version="1.0" encoding="utf-8"?> <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"> <soap:Body>    <DevuelveXmlEncriptado xmlns="https://webcore.produbanco.ec/easycashdirecto">      <strXmlInput>string</strXmlInput> <strUsuario>string</strUsuario> <strComputador>string</strComputador> <Empresa>string</Empresa> </DevuelveXmlEncriptado> </soap:Body> </soap:Envelope> 

## • Definición Producción 

<mark>POST /WSCashDirecto/easycashdirecto.asmx HTTP/1.1</mark> Host: 172.24.10.129 Content-Type: text/xml; charset=utf-8 Content-Length: length SOAPAction: **"https://cashmanagement.produbanco.com/easycashdirecto/DevuelveXmlEncriptado"** <?xml version="1.0" encoding="utf-8"?> 

<mark><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"</mark> xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"> 

<soap:Body>    <DevuelveXmlEncriptado xmlns="https://cashmanagement.produbanco.com/easycashdirecto">      <strXmlInput>string</strXmlInput> <strUsuario>string</strUsuario> <strComputador>string</strComputador> <Empresa>string</Empresa> </DevuelveXmlEncriptado> </soap:Body> </soap:Envelope> 

## Trama de entrada 

<?xml version="1.0" encoding="utf-8"?> <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:eas="https://webcore.produbanco.ec/easycashdirecto"> <soap:Header/> <soap:Body> <eas:DevuelveXmlEncriptado> <!--Optional:--> <eas:strXmlInput> <![CDATA[<Envelope> <Empresa>NOMBRE_EMPRESA_343</Empresa> <Id_Empresa>343</Id_Empresa> <Servicio>PV</Servicio> <Id_Servicio>75</Id_Servicio> <TipoCuenta>CTE</TipoCuenta> <NumeroCuenta>000055XXXXX</NumeroCuenta> <Referencia>CARGA PRUEBA UNO</Referencia> 

<FechaInicio>23/06/2025</FechaInicio> <FechaVencimiento>24/08/2025</FechaVencimiento> <Cabecera></Cabecera> <Item>PA 000055XXXXX 1 1626 020XXXXXXX9 USD 0000000000001 CTA 0036 CTE 02002000XXX R 17035258XXXXX MARCO CRESPO FACT 1155-1157 |mcrespo@zaxxx.net</Item> <Item>PA 000055XXXXX 2 1627 020XXXXXXX9 USD 0000000000001 CTA 0036 CTE 02002000XXX R 17035258XXXXX MARCO CRESPO FACT 1155-1158 |mcrespo@zaxxx.net</Item> <NumRecs>2</NumRecs> </Envelope>]]> </eas:strXmlInput> <!--Optional:--> <eas:strUsuario>WSPRUEBAS</eas:strUsuario> <!--Optional:--> <eas:strComputador>11X.XX.XX.9</eas:strComputador> <!--Optional:--> <eas:Empresa>NOMBRE_EMPRESA_343</eas:Empresa> </eas:DevuelveXmlEncriptado> </soap:Body> </soap:Envelope> 

**Nota:** Tomar en cuenta que la información de los ítems **<Item></Item>** deben venir separados por TAB según los formatos de entrada enviados 

## Trama de respuesta 

Dentro de la etiqueta <DevuelveXmlEncriptadoResult> se tiene el siguiente formato: 

• Código_Respuesta|Trama_Encriptada 

## _Ejemplo de trama exitosa:_ 

<?xml version="1.0" encoding="utf-8"?> <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"> <soap:Body> <DevuelveXmlEncriptadoResponse xmlns="https://webcore.produbanco.ec/easycashdirecto"> <DevuelveXmlEncriptadoResult>0000|BHmxxxxxxozehThTkGMjNyOQK15xReys7pu9TJK+zPDsq/1rQTTrkd0f88KnWPyDG/4KWRFIUhsAXpVd3mkWvs CDo9mAHqnysGF/MM5meIBKGW7BkEB8MBzVEFwPb0OA5IRgI8iGIpUMLOO3uC2eccY2+Qz7g/XR19CC8C2eq36RcSw1jL8qVYTwk756P+GGa0c3wtz 8C7LqOg5She4ztSu7WsWjVYYrKTVMyOoHLD8oTpQjajbaXT3BZgIaHTqrEP8P+Qi2Fw9Cx6gq9tCuo1VPrcz3VOen47W1fPtzLxHVHA26SUNCDgymuT KQ1TOS/vcJQvBvu4EUUwJQagYVdJZk4sGJg5C3akvHBU2Hq0hvUSp2Z84/99qNi8FsgycA0UHhSbiwJ3l/Y/MN00RS2NT3BQzTk+0JWY1KDXP7+OgakMi xIrCa3xboyq6yOZgEf4m6XTMHbp2B+qnn/VP2DQdxxxxxxxevjQCCrrB8WrJPI8D/+XW98qJSr97vIm4+++ypCJvDT/guTyTZ4nA8bCS9CKpOe+OlAkfXyrc vFQN/PPI6DKKIlzBnIKVJX9XsDRZGgNFD/q1M51oRktl34GPA64aAD9qb6XdI0hy7EEtyXtC4+tpd4rOXkn3Sek5XrZ9YPXusYyO50Zdclb/kskrFE5diodUwy Wf5VJbA9gfyPwVlD2wrvA6m04EHrnMu+HfZ8UZYPKEQiTLO+gA1CyLxMxa1N5hXsaMfPyb1T2tIH9iRKsAYt96Z9jx5PBx1HFyREJUEMKQy4eEF84Q5 HKu5ngQX828eSndGYLIo4/csXjMOCzkyLW4Lb+zO1PF14jI/EzCin8thkHXLlbKFZTYn5SnAsUmbkugMY=</DevuelveXmlEncriptadoResult> </DevuelveXmlEncriptadoResponse> </soap:Body> </soap:Envelope> 

**Nota:** En caso de que el código de respuesta de la etiqueta <DevuelveXmlEncriptadoResult> sea 0000, el texto a partir del símbolo | se debe enviar al método de carga. 

En caso de presentar algún error, la respuesta al método es: 

- Error cuando los datos ingresados no están autorizados para la consulta 

<mark><?xml version="1.0" encoding="utf-8"?></mark> 

<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"> 

<soap:Body> 

<DevuelveXmlEncriptadoResponse xmlns="https://webcore.produbanco.ec/easycashdirecto"> 

<DevuelveXmlEncriptadoResult>9999|Parametrizacion incorrecta en CashDirecto_Autorizacion. El usuario, la computadora o la empresa no esta de acuerdo a los datos suministrados.</DevuelveXmlEncriptadoResult> 

</DevuelveXmlEncriptadoResponse> </soap:Body> </soap:Envelope> 

- Error cuando se genera un tipo de excepción o error interno del método 

<mark><?xml version="1.0" encoding="utf-8"?></mark> 

<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"> 

<soap:Body> 

<DevuelveXmlEncriptadoResponse xmlns="https://webcore.produbanco.ec/easycashdirecto"> 

<DevuelveXmlEncriptadoResult>9999|Error de conexion con la base de datos. Error:201 Procedure or function 'sps_consultar_cashdirectoautorizacion_contratos_excepciones' expects parameter '@i_string_empresa', which was not supplied.</DevuelveXmlEncriptadoResult> </DevuelveXmlEncriptadoResponse> </soap:Body> </soap:Envelope> 

## 2.1.2 Método: CargaDirectaXML 

- Argumentos: 

|**Argumento**|**Descripción**|**Tipo **|
|---|---|---|
|strXmlInput|Cadena encriptada como resultado al método DevuelveXmlEncriptado|string|
|strUsuario|Usuario autorizadopara realizar la carga.|string|
|strComputador|IP desde el cual se realiza la carga.|string|
|Empresa|Identificador o Nombre de la Empresa. Ej. 64 ó NOMBRE_EMPRESA_343.<br>Este nombre de empresa debe ser el mismo con el cual está creado en las<br>empresas de cash|<br>string|



- Definición testing 

POST /WSCashDirecto/easycashdirecto.asmx HTTP/1.1 Host: 172.10.18.74 Content-Type: text/xml; charset=utf-8 Content-Length: length SOAPAction: **"https://webcore.produbanco.ec/easycashdirecto/CargaDirectaXml"** <?xml version="1.0" encoding="utf-8"?> <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"> <soap:Body>    <CargaDirectaXml xmlns="https://webcore.produbanco.ec/easycashdirecto">      <strXmlInput>string</strXmlInput> <strUsuario>string</strUsuario> <strComputador>string</strComputador> <Empresa>string</Empresa> 

</CargaDirectaXml> </soap:Body> </soap:Envelope> 

- Definición producción 

POST /WSCashDirecto/easycashdirecto.asmx HTTP/1.1 Host: 172.24.10.129 Content-Type: text/xml; charset=utf-8 Content-Length: length SOAPAction: **"https://cashmanagement.produbanco.com/easycashdirecto/CargaDirectaXml"** <?xml version="1.0" encoding="utf-8"?> <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"> 

<soap:Body>    <CargaDirectaXml xmlns="https://cashmanagement.produbanco.com/easycashdirecto">      <strXmlInput>string</strXmlInput> <strUsuario>string</strUsuario> <strComputador>string</strComputador> <Empresa>string</Empresa> </CargaDirectaXml> </soap:Body> </soap:Envelope> 

## Trama de entrada 

<mark><?xml version="1.0" encoding="utf-8"?></mark> <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"> <soap:Body> <CargaDirectaXml xmlns="https://webcore.produbanco.ec/easycashdirecto"> <strXmlInput>BHmJk79zqzpyoxxxxxxxxQK15xReys7pu9TJK+zPDsq/1rQTTrkd0f88KnWPyDG/4KWRFIUhsAXpVd3mkWvsCDo9mAHqnysGF/MM5meI BKGW7BkEB8MBzVEFwPbcECqpctrXAJiJUSV8i+Pxl3hMykgk7VIDc846VGXbZrxdgnzxLTWH6AbOfVFZQl8Y8vcdAzLasM+TMkIlWtntfBqO9MFTJGtCKl WK2FOQp8buB4nUPapT0OmMBGA3cy1q61ryF6kzS9F20WJsPkjHEHl0uskzI+JzEbxv3I3N848RJIu6QirIEotTifhnwFuC6ar4midjkv9TsNziofyNPQ/sROSP 5t/ubioNCTRdbB6YlBaxCKa10QGKc0dUukg+70Jm/zw4PXd4HKYRq1hDtpaIgFTubaX901Cw2j4+WtgMMv9en8JzjL5BAnxxDaxiYmVEumVPog4jbDuC2 2RFvv+K3Ug/8BLKuk9PZk4Tjt/H88JunNe2BLi9ZsJFafEizQwqOCE/+SWiN9h8ALqXpaNdCqnpp74RMJWqgi/WWNgptDGbQsjgl4keleLLbHElANAFU1qY 4tg2A6h8IKkfKDc5OVyp8GJPSiOTeKXfSyTuJiwiOCxn1fkCDxxxxxxxxxxgfLtU2DbQdEWHfFYnJmPZfUmIiay54wbsggKzajIXATx2ozRu5aYzf9UVVkWSO 83HBfXXJUB/bNWyE7/VGNRf7+uQkw7r/aa6WCOW6WbIX1jG3jRiqqQvD3QSsn4UtfHyJugpnOyqsSm6X5nN/HgfZBzbGYO3x20pN458CNFSLDVpBPf uEj0XQzK2pNiYE+aC3NhlOBKCy4yMAShr98QBlCA+WB96pPPL9AZpcSLRCxm+oQ/ZDx7Dc8oXUCsnmtNMV3mG/dfeQggf2Vgl/zc4Hgx4yX0weyVz8q 6qGmhHXKx12ST4cbCMLvtkWZxSOsWnRkOloqSp/aBWWR/nriPPWY5iVxs5Eh1I6gpcRIsPtrdDApPz/0OxEHqRTtoc2YET/lJlel3WiUsU3K0MF4a33FwZ T+euScJ6cw24SCHk5eMniNm3m0LJxyeP+YaaSdCJpSafcbPWwa9SwZK1FaX2sk8QHgknkG9Fimri7mxNuo94Rj2ZE+nXtk0jbQ8RZNgwG+kZELXc6+rJzE NlEEzTJRhdJPXMOCA5I1LDyhobhu31jDXsLTn7</strXmlInput> <strUsuario>WSPRUEBAS</strUsuario> <strComputador>11X.XX.XX.9</strComputador> <Empresa> NOMBRE_EMPRESA_343</Empresa> </CargaDirectaXml> </soap:Body> </soap:Envelope> 

Trama de respuesta 

## _Ejemplo de trama exitosa:_ 

<mark><?xml version="1.0" encoding="utf-8"?></mark> <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"> <soap:Body> <CargaDirectaXmlResponse xmlns="https://webcore.produbanco.ec/easycashdirecto"> <CargaDirectaXmlResult> <Resultado> <Cabecera> <Envio_Id>289680</Envio_Id> <Referencia>CARGA PRUEBA UNO</Referencia> <Numero_Items_Cabecera>2</Numero_Items_Cabecera> <Numero_Items>2</Numero_Items> <Valor_Cabecera>0.02</Valor_Cabecera> <Valor>0.02</Valor> <Estado>VALIDADO</Estado> <MensajeRespuesta>La orden permanecerá PENDIENTE hasta su aprobación</MensajeRespuesta> </Cabecera> <Detalle> <Items_Resultado_Id>374852</Items_Resultado_Id> <Envio_Id>289680</Envio_Id> <Numero_Linea>0</Numero_Linea> <Resultado>ENVIO OK</Resultado> </Detalle> </Resultado> 

</CargaDirectaXmlResult> </CargaDirectaXmlResponse> </soap:Body> </soap:Envelope> 

En caso de presentar algún error, la respuesta al método es: 

## • Error por intermitencia 

<?xml version="1.0" encoding="utf-8"?> <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"> <soap:Body> <CargaDirectaXmlResponse xmlns="https://webcore.produbanco.ec/easycashdirecto"> 

<CargaDirectaXmlResult>9999|No se pudo insertar el buzon.  Error: Invalid length for a Base-64 char array or string. StackTrace:    at System.Convert.FromBase64_Decode(Char* startInputPtr, Int32 inputLength, Byte* startDestPtr, Int32 destLength) at System.Convert.FromBase64CharPtr(Char* inputPtr, Int32 inputLength) at System.Convert.FromBase64String(String s) at EasySoft.Util.EasyCriptografia.Desencriptar(String cryptoText, String key) 

at WSEasyCashDirecto.CargaDirecta.CargaDirectaXml(String strXmlInput, String strUsuario, String strComputador, String Empresa)</CargaDirectaXmlResult> </CargaDirectaXmlResponse> </soap:Body> </soap:Envelope> 

## • Error por estructura general 

<mark><?xml version="1.0" encoding="utf-8"?></mark> 

<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"> 

<soap:Body> 

<CargaDirectaXmlResponse xmlns="https://webcore.produbanco.ec/easycashdirecto"> 

<CargaDirectaXmlResult>9999|No se pudo insertar el buzon.  Error: Column 'Numero_Cuenta' does not belong to table . StackTrace:    at System.Data.DataRow.GetDataColumn(String columnName) 

at System.Data.DataRow.get_Item(String columnName) 

at EasySoft.CargaDirecta.LogicaNegocio.AdmCargaDirecta.CargaDirecta(String strXmlInput, String strUsuario, String strComputador, String codigoServicioParametrizado, String excepcionParametrizada) 

at WSEasyCashDirecto.CargaDirecta.CargaDirectaXml(String strXmlInput, String strUsuario, String strComputador, String Empresa)</CargaDirectaXmlResult> </CargaDirectaXmlResponse> </soap:Body> </soap:Envelope> 

## • Error de datos incorrectos en el ítem 

<mark><?xml version="1.0" encoding="utf-8"?></mark> 

<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"> 

<soap:Body> <CargaDirectaXmlResponse xmlns="https://webcore.produbanco.ec/easycashdirecto"> <CargaDirectaXmlResult> 

<Resultado> 

<Cabecera> <Envio_Id>289682</Envio_Id> <Referencia>CARGA PRUEBA UNO</Referencia> <Numero_Items_Cabecera>2</Numero_Items_Cabecera> <Numero_Items>1</Numero_Items> <Valor_Cabecera>0.01</Valor_Cabecera> <Valor>0.01</Valor> <Estado>INVALIDO</Estado> <MensajeRespuesta>Favor revise el archivo de su orden</MensajeRespuesta> </Cabecera> <Detalle> <Items_Resultado_Id>374853</Items_Resultado_Id> <Envio_Id>289682</Envio_Id> <Numero_Linea>1</Numero_Linea> <Resultado>NUMERO_CUENTA DEBE SER NUMERICO: []</Resultado> </Detalle> </Resultado> </CargaDirectaXmlResult> </CargaDirectaXmlResponse> </soap:Body> </soap:Envelope> 

- **2.2 Consulta de órdenes** 

- **2.2.1** Método: ConsultaOrdenes 

   - Argumentos: 

|**Argumento**|**Descripción**|**Tipo**|**Valorpor defecto**|**Observaciones**|
|---|---|---|---|---|
|strIdEmpresa|Id de la empresa a consultar|string|No posee valor por defecto|En conjunto con el IdServicio recibido se utiliza<br>para verificar que la empresa posea un contrato<br>válido|
|strIdServicio|Id del Servicio a consultar|string|No posee valor por defecto|En conjunto con el IdEmpresa recibido se utiliza<br>para verificar que la empresa posea un contrato<br>válido|
|estadoSobre|Estado de las órdenes a consultar|string|TODAS|Valores posibles:|
|||||TODAS|
|||||PROCESADO|
|||||APROBADO|
|||||ACTIVO|
|||||REVOCADO|
|ordenamiento|Campo o columna por el cual se va<br>a ordenar la consulta|string|Fecha_Creacion_Date|<br>Fecha_Creacion_Date<br>Estado_Sobre|



|fechaDesde<br>|Fecha Inicio de la consulta<br>|string<br>|No posee valor por defecto<br>|Formato aceptado:<br>ddMMyyyy <br>|
|---|---|---|---|---|
|fechaHasta<br>|Fecha Fin de la consulta<br>|string<br>|No posee valor por defecto<br>|Formato aceptado:<br>ddMMyyyy <br>|
|idSobre<br>|Id de la orden por la cual desean<br>consultar<br>|string<br>|**0**<br>||
|**Ip**<br>|Nombre de la PC o IP de la misma<br>desde el cual se realiza la carga<br>|string<br>|No posee valor por defecto<br>||
|user<br>|Usuario autorizado para realizar la<br>carga<br>|string<br>|No posee valor por defecto<br>||
|referencia<br>|Referencia registrada en la carga<br>|string<br>|Por defecto siempre se envía<br>el signo de admiración**!** <br>||
|tipoConsulta<br>|Tipo de Consulta<br>|string<br>|CashNR<br>||
|idBuzon<br>|Filtrar por el id del buzón<br>|string<br>|**0**<br>|Colocar el valor generado que viene en la<br>respuesta del método CargaDirectaXML en la<br>etiqueta Envio_id<br>|
|ultimoNumTransaccion<br>|Para indicar el paginado. Por<br>ejemplo, si se ejecutó la consulta y<br>trajo los 100 primeros registros, si<br>se ejecuta nuevamente, el valor de<br>este campo debe ser 100 para que<br>traiga los registro del 100 al 200.<br>|string<br>|**0**<br>||



numeroRegistro Número de registro a traer por la string **0** consulta (Paginado), pe: 100 ~~<mark>ee</mark>~~ 



<!-- Start of picture text -->
0<br><!-- End of picture text -->

• Definición testing 

<mark>POST /WSCashDirecto/easycashdirecto.asmx HTTP/1.1</mark> Host: 172.10.18.74 Content-Type: text/xml; charset=utf-8 Content-Length: length SOAPAction: **"https://webcore.produbanco.ec/easycashdirecto/ConsultaOrdenes"** <?xml version="1.0" encoding="utf-8"?> <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"> <soap:Body> <ConsultaOrdenes xmlns="https://webcore.produbanco.ec/easycashdirecto"> <strIdEmpresa>string</strIdEmpresa> <strIdServicio>string</strIdServicio> <estadoSobre>string</estadoSobre> <ordenamiento>string</ordenamiento> <fechaDesde>string</fechaDesde> <fechaHasta>string</fechaHasta> <idSobre>string</idSobre> <ip>string</ip> <user>string</user> <referencia>string</referencia> <tipoConsulta>string</tipoConsulta> 

<idBuzon>string</idBuzon> <ultimoNumTransaccion>string</ultimoNumTransaccion> <numeroRegistro>string</numeroRegistro> </ConsultaOrdenes> </soap:Body> </soap:Envelope> 

## • Definición Producción 

POST /WSCashDirecto/easycashdirecto.asmx HTTP/1.1 Host: 172.24.10.129 Content-Type: text/xml; charset=utf-8 Content-Length: length SOAPAction: **"https://cashmanagement.produbanco.com/easycashdirecto/ConsultaOrdenes"** <?xml version="1.0" encoding="utf-8"?> <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"> <soap:Body> <ConsultaOrdenes xmlns="https://cashmanagement.produbanco.com/easycashdirecto"> <strIdEmpresa>string</strIdEmpresa> <strIdServicio>string</strIdServicio> <estadoSobre>string</estadoSobre> <ordenamiento>string</ordenamiento> <fechaDesde>string</fechaDesde> <fechaHasta>string</fechaHasta> <idSobre>string</idSobre> <ip>string</ip> 

<mark><user>string</user></mark> <referencia>string</referencia> <tipoConsulta>string</tipoConsulta> <idBuzon>string</idBuzon> <ultimoNumTransaccion>string</ultimoNumTransaccion> <numeroRegistro>string</numeroRegistro> </ConsultaOrdenes> </soap:Body> </soap:Envelope> 

## Trama de entrada 

<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:eas="https://webcore.produbanco.ec/easycashdirecto"> <soapenv:Header/> <soapenv:Body> <eas:ConsultaOrdenes> <eas:strIdEmpresa>343</eas:strIdEmpresa> <eas:strIdServicio>75</eas:strIdServicio> <eas:estadoSobre>TODAS</eas:estadoSobre> <eas:ordenamiento>Fecha_Creacion_Date</eas:ordenamiento> <eas:fechaDesde>24062025</eas:fechaDesde> <eas:fechaHasta>25062025</eas:fechaHasta> <eas:idSobre>0</eas:idSobre> <eas:ip>1XX.XX.XX.9</eas:ip> <eas:user>WSPRUEBAS</eas:user> <eas:referencia>!</eas:referencia> <eas:tipoConsulta>CashNR</eas:tipoConsulta> 

<eas:idBuzon>289682</eas:idBuzon> <eas:ultimoNumTransaccion>0</eas:ultimoNumTransaccion> <eas:numeroRegistro>0</eas:numeroRegistro> </eas:ConsultaOrdenes> </soapenv:Body> </soapenv:Envelope> 

Trama de respuesta 

_Ejemplo de trama exitosa:_ 

<?xml version="1.0" encoding="utf-8"?> <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema- <u>instance"</u> xmlns:xsd="http://www.w3.org/2001/XMLSchema"> 

<soap:Body> <ConsultaOrdenesResponse xmlns="https://webcore.produbanco.ec/easycashdirecto"> 

<ConsultaOrdenesResult>{"TRX":[{"CodRetorno":"0001","MsjRetorno":"Proceso Ok."}],"Consulta_Sobres_VIEW":[{"id_contrato":24288,"Nombre":" NOMBRE_EMPRESA_343","Moneda":"USD","Id_Sobre":18476797,"Cuenta":"CTE 000055XXXXX","Referencia":"CARGA PRUEBA 

UNO","Fecha_Creacion":"23/06/2025","Inicio":"23/06/2025","Vencimiento":"24/08/2025","Numero_Items":2,"Valor_Sobre":"0.02","Estado_Sobre":"APRO BADO","Accion":" ","NuevoEstado_Proceso":"","Usuario_Envio":"WSPRUEBAS","Usuario":"WSPRUEBAS","Nombre_Archivo":"CashDirecto_b2d96e3eec97-41bc-945e- 

aba006d1faef.TXT","Descripcion_Servicio":"PAGO DE SERVICIOS VARIOS","Fuente_Informacion":"LOCAL","Procesado_por":"MANAGERPROCESO4","Intentos_Manager":1,"Numero_Identificacion":"09XXXXXXXX001","Codigo_Servicio":"PV","MonedaExt":"USD"}]}</ConsultaOrdenesResult> </ConsultaOrdenesResponse> </soap:Body> </soap:Envelope> 

**Nota:** el texto que se encuentra dentro de la etiqueta <ConsultaOrdenesResult> es de tipo JSON como STRING 

<mark>[{</mark> "id_contrato": 24288, "Nombre": "NOMBRE_EMPRESA_343", "Moneda": "USD", "Id_Sobre": 18476797, "Cuenta": "CTE 000055XXXXX", "Referencia": "CARGA PRUEBA UNO", "Fecha_Creacion": "23/06/2025", "Inicio": "23/06/2025", "Vencimiento": "24/08/2025", "Numero_Items": 2, "Valor_Sobre": "0.02", "Estado_Sobre": "APROBADO", "Accion": " ", "NuevoEstado_Proceso": "", "Usuario_Envio": "WSPRUEBAS", "Usuario": "WSPRUEBAS", "Nombre_Archivo": "CashDirecto_b2d96e3e-ec97-41bc-945e-aba006d1faef.TXT", "Descripcion_Servicio": "PAGO DE SERVICIOS VARIOS", "Fuente_Informacion": "LOCAL", "Procesado_por": "MANAGERPROCESO-4", "Intentos_Manager": 1, "Numero_Identificacion": "09XXXXXXXX001", "Codigo_Servicio": "PV", "MonedaExt": "USD" <u>}]</u> 

En caso de presentar algún error, la respuesta al método es: 

- Error cuando no existe la orden 

<mark><?xml version="1.0" encoding="utf-8"?></mark> <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"> <soap:Body> <ConsultaOrdenesResponse xmlns="https://webcore.produbanco.ec/easycashdirecto"> <ConsultaOrdenesResult>{"TRX":[{"CodRetorno":"0005","MsjRetorno":"No se encontro informacion con los datos enviados."}]}</ConsultaOrdenesResult> </ConsultaOrdenesResponse> </soap:Body> </soap:Envelope> 

- Error cuando se genera un tipo de excepción o error interno del método 

<mark><?xml version="1.0" encoding="utf-8"?></mark> <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema- <u>instance"</u> xmlns:xsd="http://www.w3.org/2001/XMLSchema"> <soap:Body> <ConsultaOrdenesResponse xmlns="https://webcore.produbanco.ec/easycashdirecto"> <ConsultaOrdenesResult>9999|One or more errors occurred.</ConsultaOrdenesResult> </ConsultaOrdenesResponse> </soap:Body> </soap:Envelope> 

## • Error cuando los datos ingresados no están autorizados para la consulta 

<?xml version="1.0" encoding="utf-8"?> <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"> <soap:Body> <ConsultaOrdenesResponse xmlns="https://webcore.produbanco.ec/easycashdirecto"> <ConsultaOrdenesResult><Resultado> <Cabecera> <Envio_Id>0</Envio_Id> <Referencia /> <Numero_Items_Cabecera>0</Numero_Items_Cabecera> <Numero_Items>0</Numero_Items> <Valor_Cabecera>0</Valor_Cabecera> <Valor>0</Valor> <Estado>ERROR</Estado> <MensajeRespuesta>Parametrizacion incorrecta en CashDirecto_Autorizacion. El usuario, la computadora o la empresa no esta de acuerdo a los datos suministrados.</MensajeRespuesta> </Cabecera> </Resultado></ConsultaOrdenesResult> </ConsultaOrdenesResponse> </soap:Body> </soap:Envelope> 

- **2.3 Consulta de movimientos** 

## **2.3.1** Método: ConsultaMovimientos 

- Argumentos: 

|**Argumento**<br>~~a~~|**Descripción**<br>~~e~~|**Tipo**<br>~~e~~|**Valor por defecto**<br>|**Observaciones**|
|---|---|---|---|---|
|strIdEmpresa<br>|Id de la empresa a<br>consultar<br><br>||string<br>|No posee valor por defecto<br>|En conjunto con el IdServicio recibido se utiliza para verificar que<br>la empresa posea un contrato válido|
|strIdServicio|Id del Servicio a<br>consultar<br>|string|No posee valor por defecto|En conjunto con el IdEmpresa recibido se utiliza para verificar<br>que la empresa posea un contrato válido|
|strFechaDesde:|Fecha Inicio de la<br>consulta|string|No posee valor por defecto|Formatos aceptados:<br>ddMMyyyy<br>yyyyMMdd|
|strFechaHasta|Fecha Fin de la consulta|string|No posee valor por defecto<br>~~p~~|Formatos aceptados:<br>ddMMyyyy<br>yyyyMMdd<br>|
|estado|Estado de los<br>movimientos|string|TODOS<br>|Valores posibles:<br>TODOS<br>|



|||||PENDIENTE|
|---|---|---|---|---|
|||||PROCESO OK<br>ENTREGADO OK<br>IMPRESO OK<br>PROCESADAS ERROR<br>REVOCADO<br>REVERSO OK|
|totales|Si la consulta va a<br>incluir la consulta de<br>totales|string|AMBOS|Valores posibles:<br>NO<br>AMBOS|
|IdSobre|Para filtrar por el Id del<br>Sobre|string|0|En caso de colocar el valor 0 traerá por defecto todos los<br>movimientos asociados al contrato.|
|||||Se puede consultar colocando el valor de la etiqueta**"Id_Sobre"**<br>generada en la respuesta del método**ConsultaOrdenes**lo cual<br>generara los movimientos solo de la orden consultada|
|formaPago|Formas de pago|string<br>|TODAS|Valores posibles:|



|||TODAS|
|---|---|---|
|||EFE: Efectivo|
|||CTA: Débito / Crédito a cuenta|
|||CHQ: Cheque|
|||SPI: Crédito otros bancos|
|tipoBusqueda|Tipos de búsqueda (Ej.:<br>FPM)<br>string<br>FPM|Valores posibles<br>FPM:  Fecha proceso movimientos|
|||FIO: Fecha inicio orden|
|||FVO: Fecha vencimiento orden|
|estadoSobre|Estado de los sobres<br>(Ej.: TODAS)<br>string<br>TODAS|Valores posibles:<br>TODAS|
|||APROBADO|
|||PROCESADO<br>REVOCADO|



|banco|Campo utilizado para<br>seleccionar el banco<br>cuando este pertenece<br>a un grupo financiero.|string|AMBOS||
|---|---|---|---|---|
|NumeroRegistro|Cantidad de registros a<br>traer por la consulta,<br>por ejemplo: 100|int|100||
|strUsuario|Usuario autorizado para<br>realizar la carga|string|No posee valor definido por<br>defecto||
|strComputador|Nombre de la PC o IP<br>de la misma desde el<br>cual se realiza la carga|string<br>~~|~~|No posee valor definido por<br>defecto||
|ultimo_NumTransac<br>cion|El indicador del<br>movimiento desde el<br>cual se va a realizar la<br>siguiente consulta del<br>próximo rango|int<br>|0|Por ejemplo, si se ejecutó la consulta y trajo los 100 primeros<br>registros, se debe tomar el valor del último registro de la<br>etiqueta de respuesta (NumeroTransaccion) y colocarlo en la<br>etiqueta de consulta (ultimo_NumTransaccion), para que la<br>consulta traiga los siguientes 100 registros.|
|ordenadoPor|Campo o columna por<br>el cual se va a ordenar<br>la consulta|string|FechaProcesoDate|Valores posibles:<br>FechaProcesoDate: Fecha Proceso|
|||||Mensaje: Estado|



Id_Sobre: Id Sobre 

## • Definición testing 

<mark>POST /WSCashDirecto/easycashdirecto.asmx HTTP/1.1</mark> Host: 172.10.18.74 Content-Type: text/xml; charset=utf-8 Content-Length: length SOAPAction: **"https://webcore.produbanco.ec/easycashdirecto/ConsultaMovimientos"** <?xml version="1.0" encoding="utf-8"?> <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"> <soap:Body> <ConsultaMovimientos xmlns="https://webcore.produbanco.ec/easycashdirecto"> <strIdEmpresa>string</strIdEmpresa> <strIdServicio>string</strIdServicio> <strFechaDesde>string</strFechaDesde> <strFechaHasta>string</strFechaHasta> <estado>string</estado> <totales>string</totales> <IdSobre>string</IdSobre> <formaPago>string</formaPago> <tipoBusqueda>string</tipoBusqueda> <estadoSobre>string</estadoSobre> <banco>string</banco> 

<mark><NumeroRegistro>int</NumeroRegistro></mark> <strUsuario>string</strUsuario> <strComputador>string</strComputador> <ultimo_NumTransaccion>int</ultimo_NumTransaccion> <ordenadoPor>string</ordenadoPor> </ConsultaMovimientos> </soap:Body> </soap:Envelope> 

## • Definición Producción 

POST /WSCashDirecto/easycashdirecto.asmx HTTP/1.1 Host: 172.24.10.129 Content-Type: text/xml; charset=utf-8 Content-Length: length SOAPAction: **"https://cashmanagement.produbanco.com/easycashdirecto/ConsultaMovimientos"** <?xml version="1.0" encoding="utf-8"?> <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"> <soap:Body> <ConsultaMovimientos xmlns="https://cashmanagement.produbanco.com/easycashdirecto"> <strIdEmpresa>string</strIdEmpresa> <strIdServicio>string</strIdServicio> <strFechaDesde>string</strFechaDesde> <strFechaHasta>string</strFechaHasta> <estado>string</estado> <totales>string</totales> 

<mark><IdSobre>string</IdSobre></mark> <formaPago>string</formaPago> <tipoBusqueda>string</tipoBusqueda> <estadoSobre>string</estadoSobre> <banco>string</banco> <NumeroRegistro>int</NumeroRegistro> <strUsuario>string</strUsuario> <strComputador>string</strComputador> <ultimo_NumTransaccion>int</ultimo_NumTransaccion> <ordenadoPor>string</ordenadoPor> </ConsultaMovimientos> </soap:Body> </soap:Envelope> 

## Trama de entrada 

<mark><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:eas="https://webcore.produbanco.ec/easycashdirecto"></mark> <soapenv:Header/> <soapenv:Body> <eas:ConsultaMovimientos> <eas:strIdEmpresa>343</eas:strIdEmpresa> <eas:strIdServicio>75</eas:strIdServicio> <eas:strFechaDesde>2020-06-24</eas:strFechaDesde> <eas:strFechaHasta>2025-06-30</eas:strFechaHasta> <eas:estado>TODOS</eas:estado> <eas:totales>NO</eas:totales> <eas:IdSobre>18476797</eas:IdSobre> 

<mark><eas:formaPago>CTA</eas:formaPago></mark> <eas:tipoBusqueda>FVO</eas:tipoBusqueda> <eas:estadoSobre>TODAS</eas:estadoSobre> <eas:banco>AMBOS</eas:banco> <eas:NumeroRegistro>100</eas:NumeroRegistro> <eas:strUsuario>WSPRUEBAS</eas:strUsuario> <eas:strComputador>1XX.XX.XX.9</eas:strComputador> <eas:ultimo_NumTransaccion>0</eas:ultimo_NumTransaccion> <eas:ordenadoPor>mensaje</eas:ordenadoPor> </eas:ConsultaMovimientos> </soapenv:Body> </soapenv:Envelope> 

Trama de respuesta 

## _Ejemplo trama exitosa:_ 

<mark><?xml version="1.0" encoding="utf-8"?></mark> <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"> 

<soap:Body> <ConsultaMovimientosResponse xmlns="https://webcore.produbanco.ec/easycashdirecto"> <ConsultaMovimientosResult>{"TRX":[{"CodRetorno":"0001","MsjRetorno":"Proceso Ok."}],"Movimientos_Out":[{"NumeroTransaccion":703211908,"Id_Item":1004315393,"ReferenciaSobre":"CARGA PRUEBA UNO","Estado_Sobre":"APROBADO","Fecha_Inicio_Proceso":"2025-06-23T00:00:00","Fecha_Vencimiento_Proceso":"2025-0824T00:00:00","ContraPartida":"17XXXXXXXX001","Referencia":"CLIENTE A","Moneda":"USD","NombreContrapartida":"PAGO PROVEEDORES TRANSFERENCIA ELECTRONICA","Valor":0.0100,"TipoPago":"CTA","TipoId_Cliente":"R","NumeroId_Cliente":"17XXXXXXXX001","Identificacion":"R- 

<mark>17XXXXXXXX001","Estado_Proceso":"PROCESADO","Id_Contrato":24288,"Id_Sobre":18476797,"PaisBancoCuenta":"EC|0036|CC|02XXXXXX520","Elim</mark> inado":"N","Canal":"SRV","Medio":"SRV","NumeroDocumento":null,"Horario":"N","Mensaje":"No es posible realizar tu transacción en este canal. Acércat","Oficina":"2","FechaProcesoDate":"2025-08-24T00:00:00","FechaProceso":"2025-08-24T00:00:00","FechaProcesoMovimiento":"2025-0824T00:00:00","HoraProceso":"1900-01- 

01T12:05:06","ValorProcc":0.0000,"Estado_Impresion":"PENDIENTE","FormaPago":"CTA","Tabla":"N","Pais":"EC","Banco":"0036","Referencia_Adicional": "","Secuencial_Cobro":1,"Numero_Comprobante":"EFT000000010407","NumeroCuenta":"","No_Documento":1004315393,"Tipo_Cuenta":"CTE","Numero _Cuenta":"02XXXXXX520","CondicionProceso":107239,"Numero_SRI":"","Direccion_Cliente":"CLIENTE 

A","TipoPagoIFP":"CTA","NumeroDocumentoIFP":0,"Datos_SRI":"","ValorDocumentoIFP":"0.00","Numero_Autorizacion":0,"CodigoDpto":"24","Codigo_Ter cero":"","NombreEmisor":"","SecuencialBanco":"0","Ciudad_Cliente":"","FechaValor":"2025-08- 

24T00:00:00","Usuario":"WSPRUEBAS","Nombre_Banco":"PRODUBANCO","Empresa":"NOMBRE_EMPRESA_343","CodigoOficina":60,"MultipleReferenc ia":0,"NombreAgencia":"OFICINA PRINCIPAL GUAYAQUIL","UserID":"cashmang","ReferenciaItemCero":"18476797","ReferenciaTransaccion":"CLIENTE A","Valor_Ajuste":"0.00","Descripcion_Servicio":"PAGO DE SERVICIOS VARIOS","Fecha_Creacion":"2025-08- 

24T12:02:51.887","Numero_Cuenta_Sobre":"000055XXXXX","Tipo_Cuenta_Sobre":"CTE","Cuenta":"CTE 000055XXXXX"},{"NumeroTransaccion":703211909,"Id_Item":1004315394,"ReferenciaSobre":"2024-10- 

18T09h29","Estado_Sobre":"APROBADO","Fecha_Inicio_Proceso":"2025-06-23T00:00:00","Fecha_Vencimiento_Proceso":"2025-08- 

24T00:00:00","ContraPartida":"17XXXXXXXX001","Referencia":"CLIENTE B","Moneda":"USD","NombreContrapartida":"PAGO PROVEEDORES TRANSFERENCIA ELECTRONICA","Valor":0.0100,"TipoPago":"CTA","TipoId_Cliente":"R","NumeroId_Cliente":"17XXXXXXXX001","Identificacion":"R17XXXXXXXX001","Estado_Proceso":"PROCESADO","Id_Contrato":24288,"Id_Sobre":18476797,"PaisBancoCuenta":"EC|0036|CC|02XXXXXX520","Elim inado":"N","Canal":"SRV","Medio":"SRV","NumeroDocumento":null,"Horario":"N","Mensaje":"No es posible realizar tu transacción en este canal. Acércat","Oficina":"2","FechaProcesoDate":"2025-08-24T00:00:00","FechaProceso":"2025-08-24T00:00:00","FechaProcesoMovimiento":"2025-0824T00:00:00","HoraProceso":"1900-01- 

01T12:05:08","ValorProcc":0.0000,"Estado_Impresion":"PENDIENTE","FormaPago":"CTA","Tabla":"N","Pais":"EC","Banco":"0036","Referencia_Adicional": "","Secuencial_Cobro":1,"Numero_Comprobante":"EFT000000010407","NumeroCuenta":"","No_Documento":1004315394,"Tipo_Cuenta":"CTE","Numero _Cuenta":"02XXXXXX520","CondicionProceso":107239,"Numero_SRI":"","Direccion_Cliente":"LOTIZACION SE  ORA DE PAREJA,AV FELIPE P","TipoPagoIFP":"CTA","NumeroDocumentoIFP":0,"Datos_SRI":"","ValorDocumentoIFP":"0.00","Numero_Autorizacion":0,"CodigoDpto":"24","Codigo_Ter cero":"","NombreEmisor":"","SecuencialBanco":"0","Ciudad_Cliente":"","FechaValor":"2025-08- 

24T00:00:00","Usuario":"WSPRUEBAS","Nombre_Banco":"PRODUBANCO","Empresa":"NOMBRE_EMPRESA_343","CodigoOficina":60,"MultipleReferenc ia":0,"NombreAgencia":"OFICINA PRINCIPAL GUAYAQUIL","UserID":"cashmang","ReferenciaItemCero":"18476797","ReferenciaTransaccion":"CLIENTE 

B","Valor_Ajuste":"0.00","Descripcion_Servicio":"PAGO DE SERVICIOS VARIOS","Fecha_Creacion":"2025-0824T12:02:51.887","Numero_Cuenta_Sobre":"000055XXXXX","Tipo_Cuenta_Sobre":"CTE","Cuenta":"CTE 000055XXXXX"}]}</ConsultaMovimientosResult> </ConsultaMovimientosResponse> </soap:Body> </soap:Envelope> 

**Nota:** el texto que se encuentra dentro de la etiqueta <ConsultaMovimientosResult> es de tipo JSON como STRING 

{ "TRX": [{ "CodRetorno": "0001", "MsjRetorno": "Proceso Ok." }], "Movimientos_Out": [{ "NumeroTransaccion": 703211908, "Id_Item": 1004315393, "ReferenciaSobre": "CARGA PRUEBA UNO", "Estado_Sobre": "APROBADO", "Fecha_Inicio_Proceso": "2025-06-23T00:00:00", "Fecha_Vencimiento_Proceso": "2025-08-24T00:00:00", "ContraPartida": "17XXXXXXXX001", "Referencia": "CLIENTE A", "Moneda": "USD", "NombreContrapartida": "PAGO PROVEEDORES TRANSFERENCIA ELECTRONICA", "Valor": 0.0100, "TipoPago": "CTA", 

<mark>"TipoId_Cliente": "R",</mark> "NumeroId_Cliente": "17XXXXXXXX001", "Identificacion": "R-17XXXXXXXX001", "Estado_Proceso": "PROCESADO", "Id_Contrato": 24288, "Id_Sobre": 18476797, "PaisBancoCuenta": "EC|0036|CC|02XXXXXX520", "Eliminado": "N", "Canal": "SRV", "Medio": "SRV", "NumeroDocumento": null, "Horario": "N", "Mensaje": "Proceso ok", "Oficina": "2", "FechaProcesoDate": "2025-08-24T00:00:00", "FechaProceso": "2025-08-24T00:00:00", "FechaProcesoMovimiento": "2025-08-24T00:00:00", "HoraProceso": "1900-01-01T12:05:06", "ValorProcc": 0.0000, "Estado_Impresion": "PENDIENTE", "FormaPago": "CTA", "Tabla": "N", "Pais": "EC", "Banco": "0036", "Referencia_Adicional": "", "Secuencial_Cobro": 1, "Numero_Comprobante": "EFT000000010407", "NumeroCuenta": "", 

<mark>"No_Documento": 1004315393,</mark> "Tipo_Cuenta": "CTE", "Numero_Cuenta": "02XXXXXX520", "CondicionProceso": 107239, "Numero_SRI": "", "Direccion_Cliente": "CLIENTE A", "TipoPagoIFP": "CTA", "NumeroDocumentoIFP": 0, "Datos_SRI": "", "ValorDocumentoIFP": "0.00", "Numero_Autorizacion": 0, "CodigoDpto": "24", "Codigo_Tercero": "", "NombreEmisor": "", "SecuencialBanco": "0", "Ciudad_Cliente": "", "FechaValor": "2025-08-24T00:00:00", "Usuario": "WSPRUEBAS", "Nombre_Banco": "PRODUBANCO", "Empresa": "NOMBRE_EMPRESA_343", "CodigoOficina": 60, "MultipleReferencia": 0, "NombreAgencia": "OFICINA PRINCIPAL GUAYAQUIL", "UserID": "cashmang", "ReferenciaItemCero": "18476797", "ReferenciaTransaccion": "CLIENTE A", "Valor_Ajuste": "0.00", "Descripcion_Servicio": "PAGO DE SERVICIOS VARIOS", 

<mark>"Fecha_Creacion": "2025-08-24T12:02:51.887",</mark> "Numero_Cuenta_Sobre": "000055XXXXX", "Tipo_Cuenta_Sobre": "CTE", "Cuenta": "CTE 000055XXXXX" }, { "NumeroTransaccion": 703211909, "Id_Item": 1004315394, "ReferenciaSobre": "2024-10-18T09h29", "Estado_Sobre": "APROBADO", "Fecha_Inicio_Proceso": "2025-06-23T00:00:00", "Fecha_Vencimiento_Proceso": "2025-08-24T00:00:00", "ContraPartida": "17XXXXXXXX001", "Referencia": "CLIENTE B", "Moneda": "USD", "NombreContrapartida": "PAGO PROVEEDORES TRANSFERENCIA ELECTRONICA", "Valor": 0.0100, "TipoPago": "CTA", "TipoId_Cliente": "R", "NumeroId_Cliente": "17XXXXXXXX001", "Identificacion": "R-17XXXXXXXX001", "Estado_Proceso": "PROCESADO", "Id_Contrato": 24288, "Id_Sobre": 18476797, "PaisBancoCuenta": "EC|0036|CC|02XXXXXX520", "Eliminado": "N", "Canal": "SRV", "Medio": "SRV", 

<mark>"NumeroDocumento": null,</mark> "Horario": "N", "Mensaje": " No existe la cuenta", "Oficina": "2", "FechaProcesoDate": "2025-08-24T00:00:00", "FechaProceso": "2025-08-24T00:00:00", "FechaProcesoMovimiento": "2025-08-24T00:00:00", "HoraProceso": "1900-01-01T12:05:08", "ValorProcc": 0.0000, "Estado_Impresion": "PENDIENTE", "FormaPago": "CTA", "Tabla": "N", "Pais": "EC", "Banco": "0036", "Referencia_Adicional": "", "Secuencial_Cobro": 1, "Numero_Comprobante": "EFT000000010407", "NumeroCuenta": "", "No_Documento": 1004315394, "Tipo_Cuenta": "CTE", "Numero_Cuenta": "02XXXXXX520", "CondicionProceso": 107239, "Numero_SRI": "", "Direccion_Cliente": "LOTIZACION SE  ORA DE PAREJA,AV FELIPE P", "TipoPagoIFP": "CTA", "NumeroDocumentoIFP": 0, "Datos_SRI": "", "ValorDocumentoIFP": "0.00", 

"Numero_Autorizacion": 0, "CodigoDpto": "24", "Codigo_Tercero": "", "NombreEmisor": "", "SecuencialBanco": "0", "Ciudad_Cliente": "", "FechaValor": "2025-08-24T00:00:00", "Usuario": "WSPRUEBAS", "Nombre_Banco": "PRODUBANCO", "Empresa": "NOMBRE_EMPRESA_343", "CodigoOficina": 60, "MultipleReferencia": 0, "NombreAgencia": "OFICINA PRINCIPAL GUAYAQUIL", "UserID": "cashmang", "ReferenciaItemCero": "18476797", "ReferenciaTransaccion": "CLIENTE B", "Valor_Ajuste": "0.00", "Descripcion_Servicio": "PAGO DE SERVICIOS VARIOS", "Fecha_Creacion": "2025-08-24T12:02:51.887", "Numero_Cuenta_Sobre": "000055XXXXX", "Tipo_Cuenta_Sobre": "CTE", "Cuenta": "CTE 000055XXXXX" }] <u>}</u> 

En caso de presentar algún error, la respuesta al método es: 

## • Error parametrización incorrecta 

<?xml version="1.0" encoding="utf-8"?> <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"> <soap:Body> <ConsultaMovimientosResponse xmlns="https://webcore.produbanco.ec/easycashdirecto"> <ConsultaMovimientosResult><Resultado> <Cabecera> <Envio_Id>0</Envio_Id> <Referencia /> <Numero_Items_Cabecera>0</Numero_Items_Cabecera> <Numero_Items>0</Numero_Items> <Valor_Cabecera>0</Valor_Cabecera> <Valor>0</Valor> <Estado>ERROR</Estado> <MensajeRespuesta>Parametrizacion incorrecta en CashDirecto_Autorizacion. El usuario, la computadora o la empresa no esta de acuerdo a los datos suministrados.</MensajeRespuesta> </Cabecera> </Resultado></ConsultaMovimientosResult> </ConsultaMovimientosResponse> </soap:Body> </soap:Envelope> 

- Error cuando se genera un tipo de excepción o error interno del método 

<mark><?xml version="1.0" encoding="utf-8"?></mark> <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"> <soap:Body> <ConsultaMovimientosResponse xmlns="https://webcore.produbanco.ec/easycashdirecto"> <ConsultaMovimientosResult>9999|One or more errors occurred.</ConsultaMovimientosResult> </ConsultaMovimientosResponse> </soap:Body> </soap:Envelope> 

- Error cuando no existen movimientos 

<?xml version="1.0" encoding="utf-8"?> <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema- <u>instance"</u> xmlns:xsd="http://www.w3.org/2001/XMLSchema"> <soap:Body> <ConsultaMovimientosResponse xmlns="https://webcore.produbanco.ec/easycashdirecto"> <ConsultaMovimientosResult>{"TRX":[{"CodRetorno":"0005","MsjRetorno":"No se encontro informacion con los datos enviados."}]}</ConsultaMovi mientosResult> </ConsultaMovimientosResponse> </soap:Body> </soap:Envelope> 

**2.4 Catálogo de respuestas frecuentes en la etiqueta "Mensaje"** 

Transito bce Pendiente Eliminado Revocado Proceso ok Crédito no autorizado Numero de cedula o ruc no corresponde Rechazada cuenta no existe Rechazada orden del beneficiario Tipo de cuenta no corresponde Valor incorrecto Rechazada cuenta cerrada Rechazada cuenta bloqueada La cuenta está bloqueada para esta transacción Cuenta no aprobada, transacción no permitida Transacción no puede ser procesada Causal no permite afectar una cuenta cerrada Causal no permite afectar una cuenta cancelada No existe la cuenta La cuenta no corresponde al cliente Rech. Por no confirmacion (uso bce) 

Produbanco Vx 

